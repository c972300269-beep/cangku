const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const OUTPUT = 'E:/workbuddy/Claw/reports';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP = 'E:/workbuddy/Claw/.workbuddy/tmp/by';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const PORT = 9224;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function httpGet(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({ok:true,d})); })
      .on('error',()=>resolve({ok:false}));
  });
}

(async () => {
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);
  try { if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  const dd = TMP + '/Default'; fs.mkdirSync(dd, { recursive: true });
  const sd = SRC + '/Default';
  for (const f of ['Cookies','Cookies-journal','Login Data','Login Data-journal','Web Data','Web Data-journal','Preferences'])
    try { if (fs.existsSync(sd+'/'+f)) fs.copyFileSync(sd+'/'+f, dd+'/'+f); } catch {}
  for (const d of ['Local Storage','Network','Session Storage'])
    try { if (fs.existsSync(sd+'/'+d)) fs.cpSync(sd+'/'+d, dd+'/'+d, { recursive: true }); } catch {}
  try { if (fs.existsSync(SRC+'/Local State')) fs.copyFileSync(SRC+'/Local State', TMP+'/Local State'); } catch {}
  fs.writeFileSync(TMP+'/First Run', '');

  const chromeProcess = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${TMP}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--window-size=1920,1080', URL,
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    if ((await httpGet(`http://localhost:${PORT}/json/version`)).ok) break;
    await sleep(1000);
  }

  const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await sleep(5000);
  if (await page.locator('input[placeholder*="帐户"]').count() > 0) {
    await page.locator('button:has-text("自动登录")').first().click(); await sleep(8000);
  }
  for (let i=0; i<20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-form-item', { timeout: 30000 }).catch(()=>{});
  await sleep(5000);

  // Just set year and query - NO org/item
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2025")').first().click().catch(()=>{});
  await sleep(1000);
  console.log('Year: 2025');

  // Monitor network
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) requests.push(req.method() + ' ' + req.url().substring(0, 150));
  });

  // Call handleQuery on HProQueryTemplate
  const triggered = await page.evaluate(() => {
    let el = document.querySelector('.el-form');
    let vm = el?.__vue__;
    while (vm) {
      if (vm.$options.name === 'HProQueryTemplate') {
        if (vm.handleQuery) { vm.handleQuery(); return 'handleQuery'; }
        if (vm.query) { vm.query(); return 'query'; }
        if (vm.handleQueryConfirm) { vm.handleQueryConfirm(); return 'handleQueryConfirm'; }
        return 'no method';
      }
      vm = vm.$parent;
    }
    return 'no template';
  });
  console.log('Called:', triggered);
  await sleep(5000);
  
  console.log('API calls:', requests.filter(r => !r.includes('cdn') && !r.includes('lang') && !r.includes('security') && !r.includes('user') && !r.includes('billType') && !r.includes('template')));
  
  await sleep(5000);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
  await sleep(2000);

  const rows = await page.locator('.el-table__body tr').count();
  console.log(`Rows: ${rows}`);

  await page.screenshot({ path: path.join(OUTPUT, 'budget_year_only.png'), fullPage: true });
  console.log('✅ budget_year_only.png');

  await browser.close();
  chromeProcess.kill();
})().catch(async err => {
  console.error('Error:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
