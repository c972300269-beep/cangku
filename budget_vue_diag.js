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

  console.log('启动headless...');
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
  console.log('就绪');

  // ===== Explore Vue component hierarchy =====
  const vueInfo = await page.evaluate(() => {
    // Try to find the root Vue instance
    const appEl = document.getElementById('app') || document.querySelector('[data-app]') || document.body.children[0];
    
    // Find all Vue instances by traversing __vue__ properties
    function findVueInstances(el, depth = 0) {
      const results = [];
      if (depth > 30) return results;
      
      if (el.__vue__) {
        const vm = el.__vue__;
        const dataKeys = vm.$data ? Object.keys(vm.$data) : [];
        const methodsKeys = vm.$options && vm.$options.methods ? Object.keys(vm.$options.methods) : [];
        results.push({
          tag: el.tagName,
          class: (typeof el.className === 'string') ? el.className.substring(0, 60) : '',
          dataKeys: dataKeys.slice(0, 20),
          methods: methodsKeys.slice(0, 20),
          hasQueryForm: dataKeys.some(k => k.toLowerCase().includes('query') || k.toLowerCase().includes('form') || k.toLowerCase().includes('filter')),
        });
      }
      
      for (const child of el.children) {
        results.push(...findVueInstances(child, depth + 1));
      }
      return results;
    }
    
    return {
      appElTag: appEl ? appEl.tagName : 'none',
      appElClass: appEl && typeof appEl.className === 'string' ? appEl.className.substring(0, 80) : '',
      vueInstances: findVueInstances(document.documentElement),
      // Also check window for global vars
      globalKeys: Object.keys(window).filter(k => k.includes('vue') || k.includes('query') || k.includes('form')).slice(0, 30),
    };
  });
  
  console.log('App element:', vueInfo.appElTag, vueInfo.appElClass);
  console.log('Global keys:', vueInfo.globalKeys.join(', '));
  console.log('\nVue instances:');
  vueInfo.vueInstances.forEach((v, i) => {
    if (v.dataKeys.length > 0 || v.methods.length > 0) {
      console.log(`  [${i}] <${v.tag}> "${v.class}"`);
      console.log(`      data: [${v.dataKeys.join(', ')}]`);
      console.log(`      methods: [${v.methods.join(', ')}]`);
    }
  });

  // ===== Try to get the query form data directly =====
  const formData = await page.evaluate(() => {
    // Look for the el-form with query conditions
    const formEl = document.querySelector('.el-form--inline, .query-inner, [class*="query"], [class*="search"]');
    if (!formEl || !formEl.__vue__) return { found: false };
    
    const vm = formEl.__vue__;
    // Try to get form model
    const modelData = vm.form || vm.model || vm.queryForm || vm.ruleForm || vm.formData;
    
    return {
      found: true,
      hasModel: !!modelData,
      modelKeys: modelData ? Object.keys(modelData) : [],
      modelSample: modelData ? JSON.stringify(modelData).substring(0, 500) : 'none',
    };
  });
  console.log('\n表单Vue数据:', JSON.stringify(formData, null, 2));

  // ===== Directly set form values via Vue =====
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_initial.png'), fullPage: true });
  
  // Let's try to navigate to a URL with query params if supported
  // Or try to access the component that has the query method
  const queryResult = await page.evaluate(() => {
    // Find the component that has a "查询" method
    let targetVm = null;
    
    function searchVm(el, depth) {
      if (depth > 20 || targetVm) return;
      if (el.__vue__) {
        const vm = el.__vue__;
        const methods = vm.$options && vm.$options.methods ? vm.$options.methods : {};
        if (methods.query || methods.search || methods.doQuery || methods.handleQuery) {
          targetVm = vm;
          return;
        }
        // Also check if data has query params
        if (vm.$data) {
          const keys = Object.keys(vm.$data);
          if (keys.some(k => k.includes('year') || k.includes('org') || k.includes('orgCode'))) {
            const methodKeys = Object.keys(methods);
            targetVm = { vm, dataKeys: keys, methodKeys };
            return;
          }
        }
      }
      for (const child of el.children) searchVm(child, depth + 1);
    }
    
    searchVm(document.querySelector('#app') || document.body.children[0], 0);
    
    if (!targetVm) return { found: false, msg: 'no matching vm' };
    if (targetVm.vm) {
      return {
        found: true,
        dataKeys: targetVm.dataKeys,
        methodKeys: targetVm.methodKeys,
        sample: JSON.stringify(targetVm.vm.$data).substring(0, 800),
      };
    }
    return { found: true, msg: 'has query method' };
  });
  
  console.log('\n查询组件:', JSON.stringify(queryResult, null, 2));

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message, '\n', err.stack);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
