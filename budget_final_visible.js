const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT = 'E:/workbuddy/Claw/reports';
const SRC = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP = 'E:/workbuddy/Claw/.workbuddy/tmp/bv';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  console.log('启动可见浏览器...');
  const ctx = await chromium.launchPersistentContext(TMP, {
    headless: false, channel: 'chrome', args: ['--no-first-run'],
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    await page.locator('button:has-text("自动登录")').click(); await sleep(8000);
  }
  for (let i=0; i<20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(()=>{});
  await sleep(5000);

  // Year via Playwright
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(()=>{});
  await sleep(1000);
  console.log('✓ 2026');

  // Set values DIRECTLY on the form's data model
  await page.evaluate(() => {
    // Find the el-form and its model
    const form = document.querySelector('.el-form');
    let vm = form?.__vue__;
    while (vm) {
      if (vm.model && typeof vm.model === 'object' && vm.model.year !== undefined) {
        // This is the actual form data model
        const model = vm.model;
        vm.$set(model, 'budgetOrg', { id: 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002', code: null, name: null });
        vm.$set(model, 'budgetOrg.id', 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002');
        vm.$set(model, 'budgetAccount', { id: '13403', code: null, name: null });
        vm.$set(model, 'budgetAccount.id', '13403');
        window.__modelVmName = vm.$options.name;
        break;
      }
      vm = vm.$parent;
    }
  });
  await sleep(1000);

  // Verify model
  const modelState = await page.evaluate(() => {
    const form = document.querySelector('.el-form');
    if (!form?.__vue__) return { error: 'no form vue' };
    const model = form.__vue__.model;
    return {
      year: model?.year,
      budgetOrg: model?.budgetOrg,
      budgetAccount: model?.budgetAccount,
      'budgetOrg.id': model?.['budgetOrg.id'],
      'budgetAccount.id': model?.['budgetAccount.id'],
    };
  });
  console.log('Model setter:', await page.evaluate(() => window.__modelVmName));
  console.log('Model:', JSON.stringify(modelState));

  // Click query in VISIBLE browser - should work
  console.log('\n点击查询...');
  await page.locator('button:has-text("查询")').first().click({ timeout: 10000 });
  console.log('已点击, 等待数据...');
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
  await sleep(3000);

  const rows = await page.locator('.el-table__body tr').count();
  console.log(`表格: ${rows}行`);

  await page.screenshot({ path: path.join(OUTPUT, 'budget_result.png'), fullPage: true });
  
  if (rows > 0) {
    const p = await page.evaluate(() => {
      const rs = document.querySelectorAll('.el-table__body tr');
      return Array.from(rs).slice(0, 5).map(r => Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim().substring(0, 30)));
    });
    console.log('\n数据:');
    p.forEach((r,i) => console.log(`  [${i}] ${r.join(' | ')}`));
  }

  console.log('✅ budget_result.png - 10s后关闭');
  await sleep(10000);
  await ctx.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
