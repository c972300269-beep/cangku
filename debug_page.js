const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const CDP_PORT = 9222;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  if (fs.existsSync(TMP_PROFILE)) fs.rmSync(TMP_PROFILE, { recursive: true, force: true });
  const dstDefault = TMP_PROFILE + '/Default';
  fs.mkdirSync(dstDefault, { recursive: true });
  const srcDefault = SRC_PROFILE + '/Default';
  for (const f of ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Preferences']) {
    try { if (fs.existsSync(srcDefault + '/' + f)) fs.copyFileSync(srcDefault + '/' + f, dstDefault + '/' + f); } catch {}
  }
  for (const d of ['Local Storage', 'Network', 'Session Storage']) {
    try { if (fs.existsSync(srcDefault + '/' + d)) fs.cpSync(srcDefault + '/' + d, dstDefault + '/' + d, { recursive: true }); } catch {}
  }
  try { if (fs.existsSync(SRC_PROFILE + '/Local State')) fs.copyFileSync(SRC_PROFILE + '/Local State', TMP_PROFILE + '/Local State'); } catch {}

  const chromeProcess = spawn(CHROME_EXE, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${TMP_PROFILE}`,
    '--no-first-run', '--no-default-browser-check', URL,
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try {
      const http = require('http');
      const resp = await new Promise(r => http.get(`http://localhost:${CDP_PORT}/json/version`, res => r(true)).on('error', () => r(false)));
      if (resp) break;
    } catch {}
    await sleep(1000);
  }

  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const page = browser.contexts()[0].pages()[0];
  
  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [JS ERROR]', msg.text());
  });
  page.on('pageerror', err => console.log('  [PAGE ERROR]', err.message));

  await sleep(8000);
  console.log('URL:', page.url());

  // Wait for Vue to load
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => console.log('  loading-mask not hidden'));
  await sleep(5000);

  // Full body text
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log('\n===== 页面文本 =====');
  console.log(bodyText);

  // All interactive elements
  const elements = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('button, a, input, select, [onclick], [role="button"]').forEach(el => {
      if (el.offsetParent === null) return; // not visible
      result.push({
        tag: el.tagName,
        text: (el.textContent || '').trim().substring(0, 80),
        type: el.type || '',
        placeholder: el.placeholder || '',
        id: el.id,
        class: el.className.toString().substring(0, 100),
        href: el.href || '',
      });
    });
    return result;
  });
  
  console.log('\n===== 可交互元素 =====');
  elements.forEach(el => console.log(`  ${el.tag} .${el.class} text="${el.text}" placeholder="${el.placeholder}" href="${el.href}"`));

  // Check for iframes
  const iframes = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map(f => f.src));
  console.log('\n===== Iframes =====');
  console.log(iframes.join('\n') || '(none)');

  // Get full rendered HTML
  const html = await page.evaluate(() => document.documentElement.outerHTML.substring(0, 10000));
  fs.writeFileSync('E:/workbuddy/Claw/reports/page_full.html', html);

  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/debug_full.png', fullPage: true });

  console.log('\n调试信息已保存');
  console.log('浏览器保持30秒...');
  await sleep(30000);

  await browser.close();
  chromeProcess.kill();
})().catch(err => { console.error('Error:', err.message); try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {} });
