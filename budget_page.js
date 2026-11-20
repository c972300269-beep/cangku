const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(require('puppeteer-core'));
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const b = await puppeteer.launch({ headless: false, executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
  const p = await b.newPage();
  
  console.log('登录...');
  await p.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await p.type('input[placeholder*="帐户名"]', 'chenjialin3');
  await p.type('input[placeholder*="密码"]', 'chenjialin');
  await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '登录'); if (x) x.click(); });
  await sleep(6000);

  const token = await p.evaluate(() => JSON.parse(localStorage.getItem('pro__Access-Token')).value);

  // Navigate to budget page to set org session
  console.log('打开预算页面...');
  await p.goto('https://xfk.linli580.cn/eacp/#/budget/budgetViewDetail', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(10000);

  const body = await p.evaluate(() => document.body.innerText.substring(0, 300));
  console.log('页面:', body);

  // Check Vue app
  const vueInfo = await p.evaluate(() => {
    const app = document.querySelector('#app');
    if (!app || !app.__vue__) return 'no app';
    const vm = app.__vue__;
    const store = vm.$store;
    if (store) {
      const stateKeys = Object.keys(store.state || {});
      return { hasStore: true, stateKeys: stateKeys.slice(0, 20) };
    }
    return { hasStore: false, vmKeys: Object.keys(vm).filter(k => !k.startsWith('_') && !k.startsWith('$')).slice(0, 20) };
  });
  console.log('Vue:', JSON.stringify(vueInfo));

  // Find the BudgetViewDetail component
  const bvd = await p.evaluate(() => {
    const app = document.querySelector('#app').__vue__;
    
    function findBVD(vm, depth) {
      if (depth > 10) return null;
      if (vm.$options && vm.$options.name === 'BudgetViewDetail') {
        const methods = Object.keys(vm.$options.methods || {}).filter(m => m.includes('query') || m.includes('load') || m.includes('refresh') || m.includes('handle'));
        return { found: true, methods };
      }
      if (vm.$children) {
        for (const child of vm.$children) {
          const r = findBVD(child, depth + 1);
          if (r) return r;
        }
      }
      return null;
    }
    
    return findBVD(app, 0) || 'not found';
  });
  console.log('BVD:', JSON.stringify(bvd));

  // Try API after page session
  console.log('\n调API...');
  const res = await p.evaluate(async (t) => {
    const r = await fetch('/api/api-budget/budget/view/detail/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
      body: JSON.stringify({ page: 0, size: 50 })
    });
    return { s: r.status, t: (await r.text()).substring(0, 300) };
  }, token);
  console.log('API:', res.s, res.t.replace(/\n/g, ' '));

  await b.close();
})().catch(e => console.error(e));
