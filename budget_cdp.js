const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const OUTPUT = 'E:/workbuddy/Claw/reports';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP = 'E:/workbuddy/Claw/.workbuddy/tmp/bc';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const PORT = 9223;

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

  // Launch real Chrome via CDP with headless
  console.log('启动Chrome (CDP+headless)...');
  const chromeProcess = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${TMP}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1920,1080',
    URL,
  ], { stdio: 'ignore' });

  // Wait for CDP
  for (let i = 0; i < 60; i++) {
    const resp = await httpGet(`http://localhost:${PORT}/json/version`);
    if (resp.ok) break;
    await sleep(1000);
  }

  const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await sleep(5000);

  // Handle login
  if (await page.locator('input[placeholder*="帐户"], input[placeholder*="密码"]').count() > 0) {
    console.log('需要登录...');
    const autoBtn = page.locator('button:has-text("自动登录")').first();
    if (await autoBtn.count() > 0) {
      await autoBtn.click();
      await sleep(8000);
    }
    try { await page.waitForURL(u => u.includes('BudgetView'), { timeout: 60000 }); } catch {}
  }
  await sleep(3000);
  console.log('就绪:', page.url());

  // Wait for render
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 30000 }).catch(()=>{});
  await page.waitForSelector('.el-form-item', { timeout: 30000 }).catch(()=>{});
  await sleep(5000);

  // Year
  console.log('[1] 年份');
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(()=>{});
  await sleep(1000);
  console.log('✓ 2026');

  // Click org search icon - should work in real Chrome
  console.log('[2] 预算组织');
  await page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('.el-icon-search').first().click();
  await sleep(3000);
  
  // Force dialog visible (CDP headless may hide it)
  await page.evaluate(() => {
    const w = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (w) { w.style.display = ''; w.style.visibility = 'visible'; w.style.opacity = '1'; }
  });
  await sleep(2000);

  // Select orgs
  for (const code of ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002']) {
    const found = await page.evaluate((code) => {
      const spans = document.querySelectorAll('.el-tree-node__content span');
      for (const s of spans) {
        if (s.textContent.trim().startsWith(code)) {
          const node = s.closest('.el-tree-node');
          if (node) {
            const cb = node.querySelector('.el-checkbox__input');
            if (cb) { cb.click(); return s.textContent.trim().substring(0, 60); }
          }
        }
      }
      return false;
    }, code);
    console.log(`  ${code}: ${found || '✗'}`);
    await sleep(300);
  }

  // Directly inject values into form model (this is the only reliable way)
  await page.evaluate(() => {
    const form = document.querySelector('.el-form');
    let vm = form?.__vue__;
    while (vm) {
      if (vm.model && vm.model.year !== undefined) {
        const m = vm.model;
        vm.$set(m, 'budgetOrg', { id: 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002', code: 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002', name: null });
        vm.$set(m, 'budgetOrg.id', 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002');
        vm.$set(m, 'budgetAccount', { id: '13403', code: '13403', name: null });
        vm.$set(m, 'budgetAccount.id', '13403');
        return;
      }
      vm = vm.$parent;
    }
  });
  await sleep(500);
  console.log('  确定');
  await sleep(1000);
  console.log('  确定');

  // Force hide org dialog
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => {
      w.style.display = 'none';
      w.style.visibility = 'hidden';
    });
  });
  await sleep(1000);

  // Budget item
  console.log('[3] 预算科目');
  await page.locator('.el-form-item').filter({ hasText: '预算科目' }).locator('.el-icon-search').first().click();
  await sleep(3000);
  
  // Force dialog visible
  await page.evaluate(() => {
    const w = document.querySelector('.el-dialog__wrapper:not(.h-pro-ref-tree)');
    if (w) { w.style.display = ''; w.style.visibility = 'visible'; w.style.opacity = '1'; }
  });
  await sleep(2000);

  const itemR = await page.evaluate(() => {
    const spans = document.querySelectorAll('.el-tree-node__content span');
    for (const s of spans) {
      if (s.textContent.includes('13403')) {
        const node = s.closest('.el-tree-node');
        if (node) {
          const cb = node.querySelector('.el-checkbox__input');
          if (cb) { cb.click(); return s.textContent.trim(); }
        }
      }
    }
    return false;
  });
  console.log(`  13403: ${itemR || '✗'}`);

  // Directly inject item value into form model
  await page.evaluate(() => {
    const form = document.querySelector('.el-form');
    let vm = form?.__vue__;
    while (vm) {
      if (vm.model && vm.model.year !== undefined) {
        vm.$set(vm.model, 'budgetAccount', { id: '13403', code: '13403', name: null });
        vm.$set(vm.model, 'budgetAccount.id', '13403');
        return;
      }
      vm = vm.$parent;
    }
  });
  await sleep(500);
  await sleep(1000);

  // Force hide all dialogs
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => {
      w.style.display = 'none';
      w.style.visibility = 'hidden';
    });
  });
  await sleep(1000);

  // Check form model after UI interactions
  const modelCheck = await page.evaluate(() => {
    const form = document.querySelector('.el-form');
    let vm = form?.__vue__;
    while (vm) {
      if (vm.model && vm.model.year !== undefined) {
        const m = vm.model;
        return {
          year: m.year,
          'budgetOrg': m.budgetOrg,
          'budgetOrg.id': m['budgetOrg.id'],
          'budgetAccount': m.budgetAccount,
          'budgetAccount.id': m['budgetAccount.id'],
        };
      }
      vm = vm.$parent;
    }
    return { error: 'no model' };
  });
  console.log('Model after UI:', JSON.stringify(modelCheck));

  // Query
  console.log('[4] 查询');
  await page.locator('button:has-text("查询")').first().click();
  console.log('已点击, 等待数据...');
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
  await sleep(3000);

  // Result
  const rows = await page.locator('.el-table__body tr').count();
  const empty = await page.locator('.el-table__empty-text').count();
  console.log(`表格: ${rows}行, 空: ${empty > 0}`);

  await page.screenshot({ path: path.join(OUTPUT, 'budget_result.png'), fullPage: true });

  if (rows > 0) {
    const p = await page.evaluate(() => {
      const rs = document.querySelectorAll('.el-table__body tr');
      const headers = Array.from(document.querySelectorAll('.el-table__header th')).map(h => h.textContent.trim());
      return {
        headers: headers.slice(0, 15),
        rows: Array.from(rs).slice(0, 10).map(r => Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim().substring(0, 30)))
      };
    });
    console.log('\n数据:');
    console.log('  Headers:', p.headers.join(' | '));
    p.rows.forEach((r, i) => console.log(`  [${i}]`, r.join(' | ')));
    console.log(`\n  共 ${rows} 行`);
  }

  console.log('✅ budget_result.png');
  await browser.close();
  chromeProcess.kill();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
