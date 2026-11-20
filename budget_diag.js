const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile_headless';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

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
  fs.writeFileSync(TMP_PROFILE + '/First Run', '');

  console.log('启动headless浏览器...');
  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true,
    channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });

  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);

  // Auto-login
  const autoLoginBtn = page.locator('button:has-text("自动登录"), a:has-text("自动登录")').first();
  if (await autoLoginBtn.count() > 0) {
    await autoLoginBtn.click();
    await sleep(8000);
  }

  for (let i = 0; i < 20; i++) {
    if (page.url().includes('BudgetView')) break;
    await sleep(2000);
  }
  console.log('URL:', page.url());

  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await sleep(5000);

  // ===== DIAGNOSTIC: Dump full page structure =====
  const structure = await page.evaluate(() => {
    const result = {};
    
    // Find all select-like elements
    const selects = document.querySelectorAll('select, [class*="select"], [class*="Select"], [class*="dropdown"], [class*="picker"]');
    result.selects = Array.from(selects).map(s => ({
      tag: s.tagName,
      class: s.className,
      id: s.id,
      placeholder: s.getAttribute('placeholder'),
      text: s.textContent.trim().substring(0, 100)
    }));

    // Find all input elements
    const inputs = document.querySelectorAll('input');
    result.inputs = Array.from(inputs).map(i => ({
      type: i.type,
      class: i.className,
      placeholder: i.getAttribute('placeholder'),
      readonly: i.readOnly
    }));

    // Find all form items / rows
    const formItems = document.querySelectorAll('[class*="form"], .el-form-item, .form-item, .query-item');
    result.formItems = Array.from(formItems).map(f => ({
      class: f.className.substring(0, 80),
      text: f.textContent.trim().substring(0, 100)
    }));

    // Find all clickable elements near labels
    const labels = document.querySelectorAll('label, span.label, .label-text');
    result.labels = Array.from(labels).map(l => ({
      text: l.textContent.trim(),
      tag: l.tagName,
      class: l.className.substring(0, 60),
      nextSibling: l.nextElementSibling ? l.nextElementSibling.tagName + '.' + (l.nextElementSibling.className || '').substring(0, 40) : 'none'
    }));

    // Page title and body class
    result.bodyClass = document.body.className;
    result.title = document.title;
    
    // Check for iframes
    result.iframes = document.querySelectorAll('iframe').length;
    
    // Check for common UI frameworks
    const html = document.documentElement.innerHTML;
    result.hasElementUI = html.includes('el-select') || html.includes('el-form');
    result.hasAntd = html.includes('ant-select') || html.includes('ant-form');
    result.hasBootstrap = html.includes('bootstrap');
    result.hasVue = html.includes('vue') || html.includes('__vue__');
    
    // Extract all unique class prefixes
    const allClasses = new Set();
    document.querySelectorAll('*').forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(/\s+/).filter(c => c.length > 0).forEach(c => allClasses.add(c));
      }
    });
    result.allClasses = Array.from(allClasses).sort();
    
    return result;
  });

  console.log('\n===== 页面诊断 =====');
  console.log('标题:', structure.title);
  console.log('Body class:', structure.bodyClass);
  console.log('Iframes:', structure.iframes);
  console.log('Element UI:', structure.hasElementUI);
  console.log('Ant Design:', structure.hasAntd);
  console.log('Bootstrap:', structure.hasBootstrap);
  console.log('Vue:', structure.hasVue);
  
  console.log('\n--- 标签及相邻元素 ---');
  structure.labels.forEach(l => {
    console.log(`  "${l.text}" [${l.tag}] → ${l.nextSibling}`);
  });
  
  console.log('\n--- Input元素 (前20) ---');
  structure.inputs.slice(0, 20).forEach(i => {
    console.log(`  type=${i.type} class="${i.class}" placeholder="${i.placeholder}" readonly=${i.readonly}`);
  });
  
  console.log('\n--- Select元素 (前10) ---');
  structure.selects.slice(0, 10).forEach(s => {
    console.log(`  <${s.tag}> class="${s.class}" text="${s.text}"`);
  });
  
  console.log('\n--- 所有CSS类前缀 ---');
  const prefixes = new Set();
  structure.allClasses.forEach(c => {
    const prefix = c.split('-')[0] + (c.split('-')[1] ? '-' + c.split('-')[1] : '');
    prefixes.add(prefix);
  });
  console.log(Array.from(prefixes).sort().join(', '));
  
  console.log('\n--- 全部CSS类 (前100) ---');
  console.log(structure.allClasses.slice(0, 100).join('\n'));

  // Take screenshot for visual reference
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_diagnostic.png'), fullPage: true });
  console.log('\n诊断截图: budget_diagnostic.png');

  await context.close();
  console.log('完成');
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
