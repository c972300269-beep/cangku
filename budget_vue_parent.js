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

  console.log('启动...');
  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true, channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    await page.locator('button:has-text("自动登录")').click(); await sleep(8000);
  }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);

  // Walk up Vue component tree
  const tree = await page.evaluate(() => {
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (!orgItem) return { error: 'no org item' };
    
    const ref = orgItem.querySelector('.h-pro-edit-control--ref');
    if (!ref) return { error: 'no ref control' };
    
    let vm = ref.__vue__;
    const chain = [];
    let depth = 0;
    
    while (vm && depth < 10) {
      const methods = vm.$options && vm.$options.methods ? Object.keys(vm.$options.methods) : [];
      const computed = vm.$options && vm.$options.computed ? Object.keys(vm.$options.computed) : [];
      const data = vm.$data ? Object.keys(vm.$data) : [];
      const props = vm.$options && vm.$options.propsData ? Object.keys(vm.$options.propsData) : [];
      
      chain.push({
        depth,
        name: vm.$options.name || vm.$vnode?.tag || 'unknown',
        elTag: vm.$el?.tagName,
        dataKeys: data.filter(k => k.includes('Ref') || k.includes('Visible') || k.includes('visible') || k.includes('dialog') || k.includes('value')),
        methods: methods.filter(m => m.includes('Ref') || m.includes('visible') || m.includes('show') || m.includes('open')),
        hasRefVisible: data.includes('refVisible'),
        hasVisible: data.some(k => k.toLowerCase().includes('visible')),
      });
      
      vm = vm.$parent;
      depth++;
    }
    
    return { chain };
  });
  
  console.log('Vue组件树:', JSON.stringify(tree, null, 2));

  // Now try setting refVisible directly
  const tryVisible = await page.evaluate(() => {
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (!orgItem) return { error: 'no org item' };
    
    const ref = orgItem.querySelector('.h-pro-edit-control--ref');
    if (!ref || !ref.__vue__) return { error: 'no ref vue' };
    
    let vm = ref.__vue__;
    let tried = [];
    
    // Walk up and try setting refVisible
    while (vm) {
      if (vm.$data && 'refVisible' in vm.$data) {
        vm.refVisible = true;
        tried.push({ depth: tried.length, set: 'refVisible', current: vm.refVisible });
        setTimeout(() => {
          const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
          if (dlg) dlg.style.display = '';
        }, 500);
        return { ok: true, tried };
      }
      vm = vm.$parent;
      if (tried.length > 5) break;
      tried.push({ depth: tried.length, noRefVisible: true });
    }
    
    return { ok: false, tried };
  });
  
  console.log('设置refVisible:', tryVisible);
  await sleep(2000);
  
  // Check dialog
  const dlgState = await page.evaluate(() => {
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    return dlg ? { display: dlg.style.display, visible: dlg.style.display !== 'none' } : { notFound: true };
  });
  console.log('Dialog状态:', dlgState);

  // Also try on the item (预算科目)
  const itemTree = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算科目'));
    if (!item) return { error: 'no item' };
    
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (!ref) return { error: 'no ref' };
    
    let vm = ref.__vue__;
    const chain = [];
    let depth = 0;
    
    while (vm && depth < 10) {
      const data = vm.$data ? Object.keys(vm.$data) : [];
      const methods = vm.$options && vm.$options.methods ? Object.keys(vm.$options.methods) : [];
      
      chain.push({
        depth,
        name: vm.$options.name || 'unknown',
        dataKeys: data.filter(k => k.includes('Ref') || k.includes('Visible') || k.includes('Cascader') || k.includes('value')),
        methods: methods.filter(m => m.includes('Ref') || m.includes('show') || m.includes('open')),
        hasRefVisible: data.includes('refVisible'),
      });
      
      vm = vm.$parent;
      depth++;
    }
    
    return { chain };
  });
  
  console.log('\n科目Vue树:', JSON.stringify(itemTree, null, 2));

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
