const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(require('puppeteer-core'));
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';

(async () => {
  const b = await puppeteer.launch({ headless: false, executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
  const p = await b.newPage();

  // Track network
  const apiResps = [];
  p.on('response', async resp => {
    const u = resp.url();
    if (u.includes('budget') || u.includes('detail') || u.includes('list')) {
      try {
        const t = await resp.text();
        if (t && t.length < 1000 && !t.includes('<html')) {
          apiResps.push({ u: u.substring(u.indexOf('/api')), s: resp.status(), t: t.substring(0, 200) });
        }
      } catch(e) {}
    }
  });

  // 1. Login
  console.log('[1] 登录...');
  await p.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await p.type('input[placeholder*="帐户名"]', 'chenjialin3');
  await p.type('input[placeholder*="密码"]', 'chenjialin');
  await sleep(300);
  await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '登录'); if (x) x.click(); });
  await sleep(6000);

  // Get token
  const token = await p.evaluate(() => JSON.parse(localStorage.getItem('pro__Access-Token')).value);
  console.log('  登录OK, token:', token.substring(0, 20) + '...');

  // 2. Navigate to budget detail page - try multiple URLs
  const urls = [
    'https://xfk.linli580.cn/eacp/#/budget/view/detail',
    'https://xfk.linli580.cn/eacp/#/budget/budgetViewDetail',
    'https://xfk.linli580.cn/eacp/#/budget/detail',
    'https://xfk.linli580.cn/eacp/#/budgetDetail',
  ];

  let pageOk = false;
  for (const url of urls) {
    console.log('\n[2] 尝试:', url.split('#')[1]);
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(8000);

    const info = await p.evaluate(() => {
      const app = document.querySelector('#app')?.__vue__;
      if (!app) return { noApp: true };
      
      // Search ALL Vue components
      const results = [];
      function search(vm, depth) {
        if (depth > 20 || !vm) return;
        if (results.length >= 5) return;
        const name = vm.$options?.name || vm.$options?._componentTag || '';
        if (name && (name.includes('Budget') || name.includes('HProQuery') || name.includes('Detail'))) {
          const methods = Object.keys(vm.$options?.methods || {}).filter(m => m.includes('handle') || m.includes('query') || m.includes('search') || m.includes('load'));
          results.push({ name, depth, methods });
        }
        if (vm.$children) vm.$children.forEach(c => search(c, depth + 1));
      }
      search(app, 0);
      
      return { 
        title: document.title,
        body: document.body.innerText.substring(0, 80),
        components: results,
        hasTable: document.querySelector('.el-table') !== null,
        hasForm: document.querySelector('.el-form') !== null,
      };
    });
    console.log('  页面:', info.title, '|', info.body);
    console.log('  组件:', JSON.stringify(info.components));
    console.log('  表格:', info.hasTable ? '有' : '无', '表单:', info.hasForm ? '有' : '无');

    if (info.hasForm && info.hasTable) {
      pageOk = true;
      break;
    }
  }

  if (!pageOk) {
    console.log('\n未找到预算页面，尝试从菜单进入...');
    // Click menu items
    const menuItems = await p.evaluate(() => {
      const items = [...document.querySelectorAll('a, li, span, div')]
        .filter(el => el.textContent.includes('预算'))
        .map(el => ({ text: el.textContent.trim().substring(0, 40), tag: el.tagName }));
      return items;
    });
    console.log('  菜单项:', JSON.stringify(menuItems));
  }

  // 3. Try setting form values and query
  console.log('\n[3] 尝试设置查询...');
  
  // Try via Vue model
  const queryResult = await p.evaluate((orgs) => {
    const app = document.querySelector('#app')?.__vue__;
    if (!app) return 'no app';
    
    // Walk DOM to find .el-form
    const form = document.querySelector('.el-form');
    if (!form?.__vue__) return 'no form vue';
    
    // Walk up the vue tree from the form to find HProQueryTemplate
    let vm = form.__vue__;
    const chain = [];
    while (vm) {
      const name = vm.$options?.name || '';
      chain.push(name);
      
      // Check if this has the model with year
      if (vm.model && vm.model.year !== undefined) {
        // Found! Set values
        vm.$set(vm.model, 'year', '2026');
        vm.$set(vm.model, 'budgetOrg', { id: orgs, code: orgs, name: null });
        vm.$set(vm.model, 'budgetOrg.id', orgs);
        vm.$set(vm.model, 'budgetAccount', { id: '13403', code: '13403', name: null });
        vm.$set(vm.model, 'budgetAccount.id', '13403');
        return { found: true, component: name, chain };
      }
      
      vm = vm.$parent;
    }
    return { notFound: true, chain };
  }, ORGS);
  console.log('  查询模型:', JSON.stringify(queryResult));

  // Try handleQuery
  if (queryResult.found) {
    const hqResult = await p.evaluate(() => {
      // Find HProQueryTemplate and call handleQuery
      let el = document.querySelector('.el-form')?.__vue__;
      while (el) {
        if (el.$options?.name === 'HProQueryTemplate' && el.handleQuery) {
          el.handleQuery();
          return 'handleQuery called';
        }
        el = el.$parent;
      }
      // Try from any component with handleQuery
      function findHandler(vm) {
        if (!vm) return null;
        if (vm.handleQuery) { vm.handleQuery(); return 'found handler'; }
        if (vm.$children) for (const c of vm.$children) { const r = findHandler(c); if (r) return r; }
        return null;
      }
      return findHandler(document.querySelector('#app')?.__vue__) || 'no handler';
    });
    console.log('  handleQuery:', hqResult);
    await sleep(10000);
  }

  // 4. Check results
  console.log('\n[4] 检查结果...');
  console.log('  API响应:', JSON.stringify(apiResps));
  
  const tableData = await p.evaluate(() => {
    const rows = document.querySelectorAll('.el-table__body-wrapper .el-table__row');
    if (rows.length > 0) {
      const firstRow = [...rows[0].querySelectorAll('.cell')].map(c => c.textContent.trim());
      return { rowCount: rows.length, sample: firstRow.slice(0, 10) };
    }
    const empty = document.querySelector('.el-table__empty-text');
    return { rowCount: 0, emptyMsg: empty?.textContent || '' };
  });
  console.log('  表格:', JSON.stringify(tableData));

  await b.close();
})().catch(e => console.error(e));
