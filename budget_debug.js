const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT = 'E:/workbuddy/Claw/reports';
const SRC = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP = 'E:/workbuddy/Claw/.workbuddy/tmp/bx';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const ORGS = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];

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

  const ctx = await chromium.launchPersistentContext(TMP, {
    headless: true, channel: 'chrome', args: ['--no-first-run'],
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

  // Year
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(()=>{});
  await sleep(1000);

  // Open org dialog + load data
  await page.evaluate(async () => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算组织'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (!ref?.__vue__) return;
    ref.__vue__.showRef();
    await new Promise(r => setTimeout(r, 4000));
    ref.__vue__.refVisible = true;
    const w = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (w) { w.style.display=''; w.style.visibility='visible'; w.style.opacity='1'; }
  });
  await sleep(2000);

  // Select orgs via node Vue tree store
  for (const code of ORGS) {
    const r = await page.evaluate((code) => {
      const spans = document.querySelectorAll('.el-tree-node__content span');
      for (const s of spans) {
        if (s.textContent.trim().startsWith(code)) {
          const node = s.closest('.el-tree-node');
          if (node?.__vue__) {
            const nv = node.__vue__;
            const nodeData = nv.node || nv.data;
            const keys = Object.keys(nv.$data || {});
            if (nv.tree && nv.tree.store && nodeData) {
              nv.tree.store.setChecked(nodeData, true, false);
              return { method: 'ok', hasNode: true, nodeDataKeys: nodeData ? Object.keys(nodeData).slice(0,8).join(',') : 'null', dataKeys: keys.join(',') };
            }
            return { method: 'fail', hasTree: !!nv.tree, hasStore: !!(nv.tree?.store), hasNodeData: !!nodeData, dataKeys: keys.join(',') };
        }
      }
      return false;
    }, code);
    console.log(`  ${code}: ${r ? r.method + ' - ' + r.text : '✗'}`);
    await sleep(100);
  }

  // Confirm via Vue
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算组织'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (ref?.__vue__) ref.__vue__.handleRefConfirm();
  });
  await sleep(1000);

  // CHECK: what's the ref value now?
  const refVal = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算组织'));
    if (!item) return 'no item';
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (!ref?.__vue__) return 'no ref';
    const input = item.querySelector('input');
    return {
      refVisible: ref.__vue__.refVisible,
      inputValue: input?.value,
      inputDisplay: input ? (input.value || '(empty)') : 'no input',
    };
  });
  console.log('  Ref状态:', JSON.stringify(refVal));

  // Hide dialog
  await page.evaluate(() => {
    const w = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (w) w.style.display = 'none';
  });
  await sleep(500);

  // Item - same approach
  await page.evaluate(async () => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算科目'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (!ref?.__vue__) return;
    ref.__vue__.showRef();
    await new Promise(r => setTimeout(r, 4000));
    ref.__vue__.refVisible = true;
    const w = document.querySelector('.el-dialog__wrapper:not(.h-pro-ref-tree)');
    if (w) { w.style.display=''; w.style.visibility='visible'; w.style.opacity='1'; }
  });
  await sleep(2000);

  const itemR = await page.evaluate(() => {
    const spans = document.querySelectorAll('.el-tree-node__content span');
    for (const s of spans) {
      if (s.textContent.includes('13403')) {
        const node = s.closest('.el-tree-node');
        if (node?.__vue__) {
          const nv = node.__vue__;
          if (nv.tree && nv.tree.store) {
            const nodeData = nv.node || nv.data;
            if (nodeData) {
              nv.tree.store.setChecked(nodeData, true, false);
              return { text: s.textContent.trim().substring(0, 30) };
            }
          }
        }
      }
    }
    return false;
  });
  console.log(`  Item: ${itemR ? itemR.text + ' checked=' + itemR.checked : '✗'}`);

  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算科目'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (ref?.__vue__) ref.__vue__.handleRefConfirm();
  });
  await sleep(500);
  
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => { w.style.display = 'none'; });
  });

  // Query
  await page.locator('button:has-text("查询")').first().click({ force: true, timeout: 5000 }).catch(()=>{});
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
  await sleep(3000);

  const rows = await page.locator('.el-table__body tr').count();
  console.log(`\n表格: ${rows}行`);
  await page.screenshot({ path: path.join(OUTPUT, 'budget_result.png'), fullPage: true });
  console.log('✅ budget_result.png');
  await ctx.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
