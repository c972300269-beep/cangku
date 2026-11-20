const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT = 'E:/workbuddy/Claw/reports';
const SRC = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP = 'E:/workbuddy/Claw/.workbuddy/tmp/bz';
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

  // Open org dialog
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

  // Select orgs using tree store
  const orgLog = await page.evaluate((codes) => {
    const results = [];
    for (const code of codes) {
      const spans = document.querySelectorAll('.el-tree-node__content span');
      let found = false;
      for (const s of spans) {
        if (s.textContent.trim().startsWith(code)) {
          const node = s.closest('.el-tree-node');
          if (node?.__vue__) {
            const nv = node.__vue__;
            const nodeData = nv.node || nv.data;
            const keys = Object.keys(nv.$data || {});
            if (nv.tree && nv.tree.store && nodeData) {
              nv.tree.store.setChecked(nodeData, true, false);
              results.push({ code, ok: true, keys: keys.join(','), ndKeys: Object.keys(nodeData || {}).slice(0,8).join(',') });
            } else {
              results.push({ code, ok: false, keys: keys.join(','), hasTree: !!nv.tree, hasStore: !!(nv.tree?.store), hasNode: !!nodeData });
            }
          }
          found = true;
          break;
        }
      }
      if (!found) results.push({ code, ok: false, msg: 'span not found' });
    }
    return results;
  }, ORGS);
  
  orgLog.forEach(r => console.log(`  ${r.code}: ${JSON.stringify(r)}`));

  // DIRECTLY set model + dataModel + nested object
  await page.evaluate((codes) => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算组织'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (!ref?.__vue__) return;
    const vm = ref.__vue__;
    const prop = 'budgetOrg.id';
    // Set flat value
    if (vm.model) vm.$set(vm.model, prop, codes.join(','));
    if (vm.dataModel) vm.$set(vm.dataModel, prop, codes.join(','));
    // Also set nested object
    if (vm.model?.budgetOrg) {
      vm.$set(vm.model.budgetOrg, 'id', codes.join(','));
    }
    if (vm.dataModel?.budgetOrg) {
      vm.$set(vm.dataModel.budgetOrg, 'id', codes.join(','));
    }
    // Also set code and name
    if (vm.model?.budgetOrg) {
      vm.$set(vm.model.budgetOrg, 'code', codes.join(','));
    }
    if (vm.dataModel?.budgetOrg) {
      vm.$set(vm.dataModel.budgetOrg, 'code', codes.join(','));
    }
    vm.refInputValue = codes.join(',');
  }, ORGS);
  await sleep(500);
  
  const orgDebug = await page.evaluate(() => window.__orgDebug);
  console.log('Org debug:', orgDebug);

  // Check ref value - check Vue data, not DOM
  const refVal = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算组织'));
    if (!item) return 'no item';
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (!ref?.__vue__) return 'no vue';
    // Check full component data
    const data = ref.__vue__.$data;
    // Check if there's a 'value' or 'model' prop
    const props = Object.keys(ref.__vue__.$options?.propsData || {});
    return { 
      refInputValue: data.refInputValue,
      allData: Object.keys(data).map(k => k + '=' + JSON.stringify(data[k])).join(', '),
      props
    };
  });
  console.log('Ref状态:', refVal);

  // Close
  await page.evaluate(() => {
    const w = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (w) w.style.display = 'none';
  });

  // ===== ITEM =====
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

  const itemLog = await page.evaluate(() => {
    const spans = document.querySelectorAll('.el-tree-node__content span');
    for (const s of spans) {
      if (s.textContent.includes('13403')) {
        const node = s.closest('.el-tree-node');
        if (node?.__vue__) {
          const nv = node.__vue__;
          const nodeData = nv.node || nv.data;
          if (nv.tree && nv.tree.store && nodeData) {
            nv.tree.store.setChecked(nodeData, true, false);
            return { ok: true, ndKeys: Object.keys(nodeData||{}).slice(0,8).join(',') };
          }
          return { ok: false, keys: Object.keys(nv.$data||{}).join(',') };
        }
      }
    }
    return { ok: false, msg: 'no matching span' };
  });
  console.log('Item:', JSON.stringify(itemLog));

  // Set item model directly  
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(e => e.textContent.includes('预算科目'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (!ref?.__vue__) return;
    const vm = ref.__vue__;
    const prop = 'budgetAccount.id';
    if (vm.model) {
      vm.$set(vm.model, prop, '13403');
      if (vm.model.budgetAccount) vm.$set(vm.model.budgetAccount, 'id', '13403');
    }
    if (vm.dataModel) {
      vm.$set(vm.dataModel, prop, '13403');
      if (vm.dataModel.budgetAccount) vm.$set(vm.dataModel.budgetAccount, 'id', '13403');
    }
    vm.refInputValue = '13403';
    window.__itemDebug = { prop, dmVal: vm.dataModel?.[prop], mVal: vm.model?.[prop] };
  });
  await sleep(500);
  const itemDebug2 = await page.evaluate(() => window.__itemDebug);
  console.log('Item debug:', itemDebug2);
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => { w.style.display = 'none'; });
  });

  // Close + also show what the query form model looks like
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => { w.style.display = 'none'; });
  });
  
  // Walk Vue tree to find actual query form model
  const queryForm = await page.evaluate(() => {
    const form = document.querySelector('.el-form');
    if (!form?.__vue__) return { error: 'no form vue' };
    let vm = form.__vue__;
    while (vm) {
      const model = vm.model || vm.$data?.model;
      if (model && typeof model === 'object') {
        const keys = Object.keys(model);
        const budgetKeys = keys.filter(k => k.includes('budget') || k.includes('org') || k.includes('account') || k.includes('year') || k.includes('subject'));
        if (budgetKeys.length > 0) {
          return { name: vm.$options.name, budgetKeys, vals: budgetKeys.reduce((a,k)=>{a[k]=model[k];return a;},{}) };
        }
        return { name: vm.$options.name, allKeys: keys.slice(0, 30), sample: JSON.stringify(model).substring(0, 300) };
      }
      vm = vm.$parent;
    }
    return { error: 'no model' };
  });
  console.log('Query form model:', JSON.stringify(queryForm, null, 2));

  // Set up observer to detect query
  await page.evaluate(() => {
    window.__tableChanged = false;
    const table = document.querySelector('.el-table__body');
    if (table) {
      new MutationObserver(() => { window.__tableChanged = true; }).observe(table, { childList: true, subtree: true, characterData: true });
    }
  });

  // Click query button with coordinates (use Playwright's click with position)
  const btn = page.locator('button:has-text("查询")').first();
  const box = await btn.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  } else {
    await btn.click({ force: true, timeout: 5000 }).catch(()=>{});
  }
  
  // Wait for query
  await sleep(5000);
  
  // Check if table changed
  const tableChanged = await page.evaluate(() => window.__tableChanged);
  console.log('Table changed:', tableChanged);
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
