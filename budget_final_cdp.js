const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const OUTPUT = 'E:/workbuddy/Claw/reports';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP = 'E:/workbuddy/Claw/.workbuddy/tmp/bd';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const PORT = 9225;
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function httpGet(url) {
  return new Promise(r => { http.get(url, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r({ok:true,d})); }).on('error',()=>r({ok:false})); });
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

  // CDP Chrome
  console.log('启动Chrome CDP...');
  const cp = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${TMP}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--window-size=1920,1080', URL,
  ], { stdio: 'ignore' });
  for (let i=0; i<60; i++) { if ((await httpGet(`http://localhost:${PORT}/json/version`)).ok) break; await sleep(1000); }

  const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await sleep(5000);
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    await page.locator('button:has-text("自动登录")').click(); await sleep(8000);
  }
  for (let i=0; i<20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-form-item', { timeout: 30000 }).catch(()=>{});
  await sleep(5000);
  console.log('就绪');

  // Monitor API
  let queryApi = null;
  page.on('request', req => { if (req.url().includes('/api/api-budget/budget/view/detail/list')) queryApi = req.postData(); });

  // Year
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(()=>{});
  await sleep(1000);
  console.log('[1] ✓ 2026');

  // Open org dialog + click search icon
  console.log('[2] 预算组织');
  await page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('.el-icon-search').first().click();
  await sleep(2000);
  await page.evaluate(() => {
    const w = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (w) { w.style.display=''; w.style.visibility='visible'; w.style.opacity='1'; }
  });
  await sleep(3000);

  for (const code of ORGS) {
    const f = await page.evaluate(c => {
      const ss = document.querySelectorAll('.el-tree-node__content span');
      for (const s of ss) {
        if (s.textContent.trim().startsWith(c)) {
          const cb = s.closest('.el-tree-node')?.querySelector('.el-checkbox__input');
          if (cb) { cb.click(); return s.textContent.trim().substring(0,50); }
        }
      }
      return false;
    }, code);
    console.log(`  ${code}: ${f||'✗'}`);
    await sleep(200);
  }

  // Open item dialog
  console.log('[3] 预算科目');
  await page.evaluate(() => { document.querySelectorAll('.el-dialog__wrapper').forEach(w=>{w.style.display='none';}); });
  await sleep(500);
  await page.locator('.el-form-item').filter({ hasText: '预算科目' }).locator('.el-icon-search').first().click();
  await sleep(2000);
  await page.evaluate(() => {
    const w = document.querySelector('.el-dialog__wrapper:not(.h-pro-ref-tree)');
    if (w) { w.style.display=''; w.style.visibility='visible'; w.style.opacity='1'; }
  });
  await sleep(3000);
  
  const ir = await page.evaluate(() => {
    const ss = document.querySelectorAll('.el-tree-node__content span');
    for (const s of ss) { if (s.textContent.includes('13403')) { s.closest('.el-tree-node')?.querySelector('.el-checkbox__input')?.click(); return s.textContent.trim(); } }
    return false;
  });
  console.log(`  13403: ${ir||'✗'}`);

  // Explore condition model on HProQueryTemplate
  const condInfo = await page.evaluate((codes) => {
    let vm = document.querySelector('.el-form')?.__vue__;
    while (vm) {
      if (vm.$options.name === 'HProQueryTemplate') {
        const result = {};
        // Check common condition storage locations
        if (vm.condition) result.condition = JSON.stringify(vm.condition).substring(0, 300);
        if (vm.queryCondition && typeof vm.queryCondition === 'function') {
          try { result.queryCondition = JSON.stringify(vm.queryCondition()).substring(0, 500); } catch(e) { result.queryConditionErr = e.message; }
        }
        if (vm.queryParams) result.queryParams = JSON.stringify(vm.queryParams).substring(0, 300);
        if (vm.formModel) result.formModel = JSON.stringify(vm.formModel).substring(0, 300);
        if (vm.$data) result.dataKeys = Object.keys(vm.$data).filter(k => k.includes('query') || k.includes('condition') || k.includes('form') || k.includes('model'));
        
        // Try setting the model via el-form
        const form = document.querySelector('.el-form');
        if (form?.__vue__?.model) {
          const m = form.__vue__.model;
          vm.$set(m, 'budgetOrg.id', codes);
          vm.$set(m, 'budgetAccount.id', '13403');
          vm.$set(m, 'year', '2026');
        }
        
        return result;
      }
      vm = vm.$parent;
    }
    return { error: 'not found' };
  }, ORGS.join(','));
  console.log('CondInfo:', JSON.stringify(condInfo));

  // Hide dialogs
  await page.evaluate(() => { document.querySelectorAll('.el-dialog__wrapper').forEach(w=>{w.style.display='none';}); });
  await sleep(500);

  // Call handleQuery directly
  console.log('[4] 查询');
  await page.evaluate(() => {
    let vm = document.querySelector('.el-form')?.__vue__;
    while (vm) {
      if (vm.$options.name === 'HProQueryTemplate') { vm.handleQuery(); return; }
      vm = vm.$parent;
    }
  });
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
  await sleep(3000);

  const rows = await page.locator('.el-table__body tr').count();
  console.log(`Rows: ${rows}`);
  if (queryApi) console.log('Query body:', queryApi.substring(0, 500));

  await page.screenshot({ path: path.join(OUTPUT, 'budget_result.png'), fullPage: true });
  
  if (rows > 0) {
    const p = await page.evaluate(() => {
      const rs = document.querySelectorAll('.el-table__body tr');
      const hs = Array.from(document.querySelectorAll('.el-table__header th')).map(h=>h.textContent.trim());
      return { headers: hs.slice(0,15), rows: Array.from(rs).slice(0,10).map(r=>Array.from(r.querySelectorAll('td')).map(c=>c.textContent.trim().substring(0,25))) };
    });
    console.log('\n' + p.headers.join(' | '));
    p.rows.forEach(r => console.log(r.join(' | ')));
    console.log(`共 ${rows} 行`);
  }

  console.log('✅ budget_result.png');
  await browser.close();
  cp.kill();
})().catch(async err => {
  console.error('Error:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
