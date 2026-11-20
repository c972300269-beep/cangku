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
async function tryClick(page, locator, force = false) {
  try {
    if (force) await locator.click({ force: true, timeout: 5000 });
    else await locator.click({ timeout: 5000 });
    return true;
  } catch { return false; }
}

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

  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true, channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', '--headless=new'],
  });
  const page = await context.newPage();
  
  // Intercept API to see query params
  let queryBody = null;
  page.on('request', req => {
    if (req.url().includes('query') || req.url().includes('list') || req.url().includes('data')) {
      const post = req.postData();
      if (post) queryBody = post;
      console.log(`REQ: ${req.method()} ${req.url().substring(0, 150)}`);
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

  // Year
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('[1] ✓ 2026');

  // Org - call showRef to trigger data load, then force visible
  console.log('[2] 预算组织');
  await page.evaluate(() => {
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (!orgItem) return;
    const ref = orgItem.querySelector('.h-pro-edit-control--ref');
    if (ref && ref.__vue__) {
      ref.__vue__.showRef();
      // Force dialog visible by removing ALL display:none
      setTimeout(() => {
        ref.__vue__.refVisible = true;
        const wrappers = document.querySelectorAll('.el-dialog__wrapper.h-pro-ref-tree');
        wrappers.forEach(w => {
          w.style.display = '';
          w.style.visibility = 'visible';
          w.style.opacity = '1';
          w.style.zIndex = '9999';
          // Also show inner dialog
          const inner = w.querySelector('.el-dialog');
          if (inner) {
            inner.style.display = '';
            inner.style.visibility = 'visible';
          }
        });
      }, 1500);
    }
  });
  await sleep(10000); // Wait longer for load

  // Check tree data
  const treeState = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.el-tree-node');
    const labels = Array.from(nodes).slice(0, 15).map(n => {
      const label = n.querySelector('.el-tree-node__label');
      // Try textContent and innerText and innerHTML
      const text = label ? (label.textContent || label.innerText || '').trim() : '';
      const inner = label ? label.innerHTML.substring(0, 60) : '';
      const cb = n.querySelector('.el-checkbox__input');
      return { text, inner, hasCheckbox: !!cb };
    });
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    return { 
      nodeCount: nodes.length, 
      labels,
      dlgDisplay: dlg ? dlg.style.display : 'no dlg',
      dlgInnerDisp: dlg ? dlg.querySelector('.el-dialog')?.style.display : '',
      bodyText: dlg ? dlg.textContent.trim().substring(0, 300) : ''
    };
  });
  console.log(`Tree: ${treeState.nodeCount} nodes, dlg=${treeState.dlgDisplay}, innerDlg=${treeState.dlgInnerDisp}`);
  if (treeState.labels.length > 0) console.log('Labels:', treeState.labels.map(l => l.text || l.inner || '(empty)').join(' | '));
  if (treeState.bodyText) console.log('Body:', treeState.bodyText.substring(0, 200));

  // If tree loaded, select orgs
  if (treeState.nodeCount > 0) {
    for (const code of ORG_CODES) {
      const found = await page.evaluate((code) => {
        const nodes = document.querySelectorAll('.el-tree-node');
        for (const node of nodes) {
          const label = node.querySelector('.el-tree-node__label');
          const text = label ? (label.textContent || label.innerText || '') : '';
          if (text && (text.includes(code) || text.toLowerCase().includes(code.toLowerCase()))) {
            const cb = node.querySelector('.el-checkbox__input');
            if (cb) { cb.click(); return text.substring(0, 50); }
            label.click();
            return text.substring(0, 50);
          }
        }
        return false;
      }, code);
      console.log(`  ${code}: ${found || '✗'}`);
      await sleep(200);
    }
  }

  // Close org dialog
  await page.keyboard.press('Escape');
  await sleep(500);
  await page.evaluate(() => {
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (dlg) dlg.style.display = 'none';
  });
  
  // Budget item
  console.log('[3] 预算科目');
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算科目'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (ref && ref.__vue__) {
      ref.__vue__.showRef();
      setTimeout(() => {
        ref.__vue__.refVisible = true;
        const dlg = document.querySelector('.el-dialog__wrapper:not(.h-pro-ref-tree)');
        if (dlg) dlg.style.display = '';
      }, 1000);
    }
  });
  await sleep(8000);

  // Search and select 13403
  const searchInput = page.locator('.el-dialog__wrapper:not(.h-pro-ref-tree) input[type="text"]').first();
  if (await searchInput.count() > 0) {
    await searchInput.fill('13403');
    await sleep(2000);
  }
  
  await page.evaluate(() => {
    const items = document.querySelectorAll('.el-tree-node__label, .el-cascader-node__label, li');
    for (const item of items) {
      if (item.textContent.includes('13403')) {
        const cb = item.closest('.el-tree-node, li')?.querySelector('.el-checkbox__input');
        if (cb) { cb.click(); return; }
        item.click();
        return;
      }
    }
  });
  
  await page.keyboard.press('Escape');
  await sleep(500);
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(d => { d.style.display = 'none'; });
  });
  console.log('  完成');

  // Query
  console.log('[4] 查询');
  await tryClick(page, page.locator('button:has-text("查询")').first(), true);
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(3000);

  const rows = await page.locator('.el-table__body tr').count();
  console.log(`表格: ${rows}行`);

  if (queryBody) console.log('查询请求体:', queryBody.substring(0, 500));

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('✅ budget_result.png');
  
  if (rows > 0) {
    const preview = await page.evaluate(() => {
      const rs = document.querySelectorAll('.el-table__body tr');
      return Array.from(rs).slice(0, 3).map(r => 
        Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim().substring(0, 25))
      );
    });
    console.log('数据:', JSON.stringify(preview));
  }

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
