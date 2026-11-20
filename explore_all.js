const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const CDP_PORT = 9222;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    require(url.startsWith('https') ? 'https' : 'http').get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode < 400, data }));
    }).on('error', reject);
  });
}

(async () => {
  // ========== Setup ==========
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  if (fs.existsSync(TMP_PROFILE)) fs.rmSync(TMP_PROFILE, { recursive: true, force: true });
  const dstDefault = TMP_PROFILE + '/Default';
  fs.mkdirSync(dstDefault, { recursive: true });

  const srcDefault = SRC_PROFILE + '/Default';
  for (const f of ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Preferences']) {
    try { if (fs.existsSync(srcDefault + '/' + f)) fs.copyFileSync(srcDefault + '/' + f, dstDefault + '/' + f); } catch {}
  }
  for (const d of ['Local Storage', 'Network']) {
    try { if (fs.existsSync(srcDefault + '/' + d)) fs.cpSync(srcDefault + '/' + d, dstDefault + '/' + d, { recursive: true }); } catch {}
  }
  try { if (fs.existsSync(SRC_PROFILE + '/Local State')) fs.copyFileSync(SRC_PROFILE + '/Local State', TMP_PROFILE + '/Local State'); } catch {}
  fs.writeFileSync(TMP_PROFILE + '/First Run', '');

  const chromeProcess = spawn(CHROME_EXE, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${TMP_PROFILE}`,
    '--no-first-run', '--no-default-browser-check', URL,
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try { if ((await httpGet(`http://localhost:${CDP_PORT}/json/version`)).ok) break; } catch {}
    await sleep(1000);
  }

  // ========== Connect ==========
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await sleep(5000);

  // Check login
  if (await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"]').count() > 0) {
    console.log('需要登录，请在弹出的 Chrome 中登录...');
    try { await page.waitForURL(u => u.includes('BudgetView'), { timeout: 120000 }); await sleep(3000); } catch {}
  }
  console.log('页面就绪。当前URL:', page.url());

  // ========== EXPLORE: dump page structure ==========
  console.log('\n===== 页面结构分析 =====');
  
  const explore = await page.evaluate(() => {
    const getXPath = el => {
      let p = '';
      while (el && el.nodeType === 1) {
        let idx = 1, sib = el.previousSibling;
        while (sib) { if (sib.nodeType === 1 && sib.nodeName === el.nodeName) idx++; sib = sib.previousSibling; }
        p = '/' + el.nodeName.toLowerCase() + '[' + idx + ']' + p;
        el = el.parentNode;
      }
      return p;
    };

    // Find elements containing key text
    const keyText = ['年份', '预算组织', '预算科目', '查询', '设备设施'];
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t && keyText.some(k => t.includes(k)) && t.length < 100) {
        const p = node.parentElement;
        textNodes.push({ text: t, parentTag: p.tagName, parentClass: (p.className || '').toString(), xpath: getXPath(p) });
      }
    }

    // Find inputs
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea, button'))
      .filter(el => el.offsetParent !== null)  // visible only
      .map(el => ({
        tag: el.tagName, type: el.type || '', id: el.id, name: el.name,
        class: (el.className || '').toString(), placeholder: el.placeholder || '',
        text: (el.textContent || '').trim().substring(0, 60), value: el.value || '',
        xpath: getXPath(el),
      }));

    return { textNodes, inputs, bodyHTML: document.body.innerHTML.substring(0, 8000) };
  });

  console.log('\n--- 关键文本元素 ---');
  explore.textNodes.forEach(n => console.log(`  "${n.text}" -> ${n.parentTag}.${n.parentClass}`));

  console.log('\n--- 可见的输入/按钮 ---');
  explore.inputs.forEach(el => console.log(`  ${el.tag}#${el.id} .${el.class} name="${el.name}" placeholder="${el.placeholder}" text="${el.text}"`));

  fs.writeFileSync(path.join(OUTPUT_DIR, 'page_body.html'), explore.bodyHTML);
  console.log('\nHTML已保存到 reports/page_body.html');

  // 截图
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'explore_result.png'), fullPage: true });
  console.log('截图已保存');

  await browser.close();
  chromeProcess.kill();
  console.log('完成');

})().catch(err => { console.error('错误:', err.message); try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {} });
