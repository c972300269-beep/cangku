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
    args: ['--no-first-run', '--no-default-browser-check'],
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

  // Set year
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);

  // Find and access Vuex store
  const storeInfo = await page.evaluate(() => {
    // Try to access Vuex store from the root Vue instance
    const app = document.querySelector('#app');
    let vm = app?.__vue__;
    
    // Walk up from any Vue instance to find the root with $store
    const refs = document.querySelectorAll('[class*="vue"]');
    for (const el of [app, ...Array.from(document.querySelectorAll('*'))].slice(0, 100)) {
      if (el.__vue__ && el.__vue__.$store) {
        vm = el.__vue__;
        break;
      }
    }
    
    if (!vm || !vm.$store) {
      // Try finding from the form
      const form = document.querySelector('.el-form');
      if (form && form.__vue__) {
        let v = form.__vue__;
        while (v) {
          if (v.$store) {
            vm = v;
            break;
          }
          v = v.$parent;
        }
      }
    }
    
    if (!vm || !vm.$store) return { found: false };
    
    const store = vm.$store;
    const state = store.state;
    const modules = state ? Object.keys(state).filter(k => typeof state[k] === 'object' && state[k] !== null) : [];
    
    // Get all actions and mutations
    const actions = store._actions ? Object.keys(store._actions) : [];
    const getters = store.getters ? Object.keys(store.getters) : [];
    
    return {
      found: true,
      modules,
      actions: actions.slice(0, 30),
      getters: getters.slice(0, 20),
    };
  });
  
  console.log('Vuex Store:', JSON.stringify(storeInfo, null, 2));

  if (storeInfo.found) {
    // Try to find query-related module and dispatch
    const queryAttempt = await page.evaluate(() => {
      const app = document.querySelector('#app');
      let vm = app?.__vue__;
      for (const el of [app, ...Array.from(document.querySelectorAll('*'))].slice(0, 100)) {
        if (el.__vue__ && el.__vue__.$store) { vm = el.__vue__; break; }
      }
      if (!vm?.$store) return { error: 'no store' };
      
      const store = vm.$store;
      const state = store.state;
      
      // Look for budget-related state
      const budgetKeys = Object.keys(state).filter(k => k.toLowerCase().includes('budget'));
      
      // Try dispatching query action
      const queryActions = Object.keys(store._actions || {}).filter(k => k.toLowerCase().includes('query') || k.toLowerCase().includes('load') || k.toLowerCase().includes('fetch') || k.toLowerCase().includes('search'));
      
      return {
        budgetStateKeys: budgetKeys,
        queryActions,
        budgetStateSample: budgetKeys.length > 0 ? JSON.stringify(state[budgetKeys[0]]).substring(0, 1000) : 'none'
      };
    });
    
    console.log('\n查询尝试:', JSON.stringify(queryAttempt, null, 2));
  }

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
