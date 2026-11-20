const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile_visible';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  if (fs.existsSync(TMP_PROFILE)) fs.rmSync(TMP_PROFILE, { recursive: true, force: true });
  const dstDefault = TMP_PROFILE + '/Default'; fs.mkdirSync(dstDefault, { recursive: true });
  const srcDefault = SRC_PROFILE + '/Default';
  for (const f of ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Preferences'])
    try { if (fs.existsSync(srcDefault + '/' + f)) fs.copyFileSync(srcDefault + '/' + f, dstDefault + '/' + f); } catch {}
  for (const d of ['Local Storage', 'Network', 'Session Storage'])
    try { if (fs.existsSync(srcDefault + '/' + d)) fs.cpSync(srcDefault + '/' + d, dstDefault + '/' + d, { recursive: true }); } catch {}
  try { if (fs.existsSync(SRC_PROFILE + '/Local State')) fs.copyFileSync(SRC_PROFILE + '/Local State', TMP_PROFILE + '/Local State'); } catch {}
  fs.writeFileSync(TMP_PROFILE + '/First Run', '');

  console.log('启动浏览器(可见)...');
  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: false, channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    console.log('自动登录...');
    await page.locator('button:has-text("自动登录")').click();
    await sleep(8000);
  }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);

  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);
  console.log('就绪');

  // Year
  console.log('[1] 年份');
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓ 2026');

  // Org - click search icon (should work in visible mode)
  console.log('[2] 预算组织');
  await page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('.el-icon-search').first().click();
  await sleep(5000);
  
  // Search and select each org
  const orgSearch = page.locator('.el-dialog__wrapper:not([style*="display: none"]) input[type="text"]').first();
  for (const code of ORG_CODES) {
    await orgSearch.fill(code);
    await sleep(2000);
    
    await page.evaluate((code) => {
      const nodes = document.querySelectorAll('.el-tree-node');
      for (const node of nodes) {
        const label = node.querySelector('.el-tree-node__label');
        const text = label ? (label.textContent || label.innerText || '') : '';
        if (text.includes(code)) {
          const cb = node.querySelector('.el-checkbox__input');
          if (cb) { cb.click(); return text.substring(0, 50); }
          label.click();
          return text.substring(0, 50);
        }
      }
      return false;
    }, code).then(r => console.log(`  ${code}: ${r || '✗'}`));
    await sleep(300);
  }
  
  // Click确定
  await page.locator('.el-dialog__wrapper:not([style*="display: none"]) button:has-text("确定")').first().click();
  await sleep(1000);
  console.log('  确定');

  // Budget Item
  console.log('[3] 预算科目');
  await page.locator('.el-form-item').filter({ hasText: '预算科目' }).locator('.el-icon-search').first().click();
  await sleep(5000);
  
  const itemSearch = page.locator('.el-dialog__wrapper:not([style*="display: none"]) input[type="text"]').first();
  await itemSearch.fill('13403');
  await sleep(2000);
  
  await page.evaluate(() => {
    const labels = document.querySelectorAll('.el-tree-node__label, .el-cascader-node__label');
    for (const l of labels) {
      if (l.textContent.includes('13403')) {
        const cb = l.closest('.el-tree-node')?.querySelector('.el-checkbox__input');
        if (cb) { cb.click(); return; }
        l.click();
        return;
      }
    }
  });
  console.log('  ✓');
  
  await page.locator('.el-dialog__wrapper:not([style*="display: none"]) button:has-text("确定")').first().click();
  await sleep(1000);

  // Query
  console.log('[4] 查询');
  await page.locator('button:has-text("查询")').first().click();
  console.log('等待数据...');
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(3000);

  // Result
  const rows = await page.locator('.el-table__body tr').count();
  const empty = await page.locator('.el-table__empty-text').count();
  console.log(`表格: ${rows}行, 空: ${empty > 0}`);

  // Screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  
  if (rows > 0) {
    const preview = await page.evaluate(() => {
      const rs = document.querySelectorAll('.el-table__body tr');
      return Array.from(rs).slice(0, 5).map(r => 
        Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim().substring(0, 30))
      );
    });
    console.log(`\n数据预览 (共${rows}行):`);
    preview.forEach((r, i) => console.log(`  [${i}]`, r.join(' | ')));
  }
  
  console.log('\n✅ budget_result.png - 10秒后关闭浏览器');
  await sleep(10000);
  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
