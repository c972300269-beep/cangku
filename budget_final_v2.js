const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile_headless';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];

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

  console.log('启动headless...');
  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true, channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });
  const page = await context.newPage();

  // Collect all XHR/fetch requests
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api') || url.includes('query') || url.includes('search') || url.includes('list') || url.includes('get') || url.includes('budget') || url.includes('Budget') || url.includes('eacp')) {
      apiCalls.push({ method: req.method(), url: url.substring(0, 200), postData: req.postData() });
    }
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('api') || url.includes('query') || url.includes('list') || url.includes('budget') || url.includes('Budget')) {
      try {
        const body = await resp.text();
        apiCalls.push({ type: 'response', status: resp.status(), url: url.substring(0, 200), body: body.substring(0, 300) });
      } catch {}
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    await page.locator('button:has-text("自动登录")').click(); await sleep(8000);
  }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);

  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);
  console.log('就绪');

  // ===== 1. Year =====
  console.log('[1] 年份');
  const yearInput = page.locator('.el-form-item:has-text("年份") input').first();
  await yearInput.click(); await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓');

  // ===== 2. Orgs via drawer =====
  console.log('[2] 预算组织');
  const orgInput = page.locator('.el-form-item:has-text("预算组织") input').first();
  await orgInput.click();
  await sleep(5000); // Wait for drawer

  // Dump ALL elements in drawer
  const drawerDump = await page.evaluate(() => {
    // Try both container and wrapper
    const drawer = document.querySelector('.el-drawer__container, .el-drawer__wrapper, .el-drawer');
    if (!drawer) return { error: 'no drawer found' };
    
    // Get the full HTML
    const html = drawer.outerHTML.substring(0, 3000);
    
    // Find all inputs
    const inputs = Array.from(drawer.querySelectorAll('input')).map(i => ({
      tag: 'input',
      type: i.type,
      class: typeof i.className === 'string' ? i.className.substring(0, 60) : 'SVG',
      placeholder: i.placeholder || '',
      value: i.value || '',
      readonly: i.readOnly,
    }));
    
    // Find buttons
    const buttons = Array.from(drawer.querySelectorAll('button, .el-button')).map(b => ({
      tag: b.tagName,
      text: b.textContent.trim().substring(0, 30),
      class: typeof b.className === 'string' ? b.className.substring(0, 40) : '',
    }));
    
    // Find tree/transfer/list items
    const treeNodes = drawer.querySelectorAll('.el-tree-node');
    const treeLabels = Array.from(treeNodes).slice(0, 20).map(n => {
      const label = n.querySelector('.el-tree-node__label');
      const cb = n.querySelector('.el-checkbox__input');
      const expanded = n.getAttribute('aria-expanded');
      return { 
        label: label ? label.textContent.trim().substring(0, 80) : '',
        hasCheckbox: !!cb,
        expanded: expanded
      };
    });
    
    const transferItems = Array.from(drawer.querySelectorAll('.el-transfer-panel__item, .el-transfer-panel .el-checkbox__label')).map(i => ({
      text: i.textContent.trim().substring(0, 80)
    }));
    
    // Dialog title
    const title = drawer.querySelector('.el-drawer__title, .el-dialog__title');
    
    return {
      title: title ? title.textContent.trim() : 'none',
      inputs,
      buttons,
      treeNodes: treeLabels,
      transferItems,
      htmlPreview: html,
    };
  });
  
  console.log('抽屉内容:', JSON.stringify(drawerDump, null, 2));
  
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_final.png'), fullPage: true });
  console.log('截图: budget_final.png');

  // Print API calls
  console.log('\nAPI请求 (前20):');
  apiCalls.filter(c => c.method).slice(0, 20).forEach(c => {
    console.log(`  ${c.method} ${c.url.substring(0, 120)}`);
    if (c.postData) console.log(`    POST: ${c.postData.substring(0, 200)}`);
  });
  
  console.log('\nAPI响应:');
  apiCalls.filter(c => c.type === 'response').forEach(c => {
    console.log(`  [${c.status}] ${c.url.substring(0, 120)}`);
    if (c.body) console.log(`    Body: ${c.body.substring(0, 200)}`);
  });

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
