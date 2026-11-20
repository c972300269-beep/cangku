const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/cdp_bgt';
const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(PROFILE)) fs.mkdirSync(PROFILE, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Collect intercepted API calls
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      apiCalls.push({ url: req.url(), method: req.method(), postData: req.postData() });
    }
  });

  // Step 1: Login
  console.log('[1] 进入预算系统...');
  await page.goto('https://xfk.linli580.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
  console.log('✓ 页面加载完成');

  // Step 2: Select year 2026
  console.log('[2] 选择2026年...');
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('.el-icon-date').first().click().catch(() => {});
  await sleep(2000);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓ 年份2026');

  // Step 3: Open org dialog and check orgs
  console.log('[3] 选择预算组织...');
  await page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('.el-icon-search').first().click();
  await sleep(3000);
  
  // Force dialog visible
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => {
      w.style.display = '';
      w.style.visibility = 'visible';
      w.style.opacity = '1';
    });
  });
  await sleep(2000);

  for (const code of ORGS) {
    const r = await page.evaluate((code) => {
      const spans = document.querySelectorAll('.el-tree-node__content span');
      for (const s of spans) {
        if (s.textContent.trim().startsWith(code)) {
          const node = s.closest('.el-tree-node');
          if (node) {
            const cb = node.querySelector('.el-checkbox__input');
            if (cb) { cb.click(); return s.textContent.trim().substring(0, 50); }
          }
        }
      }
      return false;
    }, code);
    console.log(`  ${code}: ${r || 'NOT FOUND'}`);
    await sleep(300);
  }

  // Try to confirm via the org component's internal mechanism
  // First, let's see what the checked state looks like
  const orgState = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.el-tree-node.is-checked');
    return nodes.length;
  });
  console.log(`  Checked nodes: ${orgState}`);

  // Now let's try a completely different approach: intercept the actual query API
  // and understand it, then construct our own call
  
  // First, hide the dialog and set the value on the form model directly
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => {
      w.style.display = 'none';
      w.style.visibility = 'hidden';
    });
  });
  await sleep(1000);

  // Step 4: Open budget item dialog
  console.log('[4] 选择预算科目...');
  await page.locator('.el-form-item').filter({ hasText: '预算科目' }).locator('.el-icon-search').first().click();
  await sleep(3000);
  
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => {
      w.style.display = '';
      w.style.visibility = 'visible';
      w.style.opacity = '1';
    });
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
  console.log(`  13403: ${itemR || 'NOT FOUND'}`);

  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => {
      w.style.display = 'none';
      w.style.visibility = 'hidden';
    });
  });
  await sleep(1000);

  // Step 5: NEW APPROACH - directly call the API via fetch from within the page
  // This bypasses the UI query mechanism entirely
  console.log('[5] 直接调用后端API...');

  // First, find the HProQueryTemplate to understand the API endpoint and params
  const queryInfo = await page.evaluate(() => {
    let vm = document.querySelector('.el-form')?.__vue__;
    const info = {};
    while (vm) {
      const name = vm.$options?.name || '';
      if (name === 'HProQueryTemplate') {
        // Extract query config
        info.config = vm.$data;
        // Look for api config
        const methods = vm.$options?.methods || {};
        info.queryMethods = Object.keys(methods).filter(m => 
          m.includes('query') || m.includes('load') || m.includes('fetch') || m.includes('api')
        );
        
        // Try to find queryUrl or api config
        if (vm.queryUrl) info.queryUrl = vm.queryUrl;
        if (vm.apiConfig) info.apiConfig = typeof vm.apiConfig;
        
        // Look at all data properties
        info.dataKeys = Object.keys(vm.$data || {});
        
        // Check the vuex store
        if (vm.$store) {
          info.storeState = Object.keys(vm.$store.state || {});
        }
      }
      vm = vm.$parent;
    }
    
    // Also check BudgetViewDetail
    let bvd = document.querySelector('[class*="BudgetView"]')?.__vue__;
    if (bvd) {
      info.bvdName = bvd.$options?.name;
      info.bvdMethods = Object.keys(bvd.$options?.methods || {}).filter(m =>
        m.includes('query') || m.includes('load') || m.includes('fetch') || m.includes('api') || m.includes('get')
      );
      info.bvdData = Object.keys(bvd.$data || {});
    }
    
    return info;
  });
  console.log('Query info:', JSON.stringify(queryInfo, null, 2));

  // Now try to find the exact API endpoint by examining the page source or network
  await page.evaluate(() => {
    // Try to find the API URL from the page's module config
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent || '';
      if (text.includes('budget') && text.includes('api')) {
        window.__budgetApi = text.substring(0, 500);
        break;
      }
    }
  });

  const apiText = await page.evaluate(() => window.__budgetApi || 'not found');
  console.log('API text from scripts:', apiText.substring(0, 300));

  // Step 6: Try to make a direct fetch call with the token/cookies
  console.log('[6] 尝试直接fetch API...');
  
  const fetchResult = await page.evaluate(async () => {
    try {
      // Try the API we saw in previous debugging
      const resp = await fetch('/api/api-budget/budget/view/detail/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Q_main: {
            PERIOD_S_EQ: 2026,
            ORG_ID_S_IN: 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002',
            ACCOUNT_ID_S_EQ: '13403',
          },
          page: 0,
          size: 500,
        }),
      });
      const text = await resp.text();
      return { status: resp.status, text: text.substring(0, 500), ok: resp.ok };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('Fetch result:', JSON.stringify(fetchResult, null, 2));

  // If that didn't work, try different parameter formats
  if (!fetchResult.ok) {
    console.log('[6b] 尝试不同的参数格式...');
    const formats = [
      { Q_main: { PERIOD_S_EQ: '2026' }, page: 0, size: 500 },
      { Q_main: { PERIOD_S_EQ: 2026 }, page: 0, size: 500 },
      { PERIOD: '2026', page: 0, size: 500 },
      { Q_main: { PERIOD_S_EQ: '2026', ORG_ID_S_IN: ORGS.join(',') }, page: 0, size: 500 },
      { Q_main: { PERIOD_S_EQ: '2026', ORG_ID_S_IN: ORGS.join(',') }, page: 1, size: 100 },
    ];
    
    for (const fmt of formats) {
      const r = await page.evaluate(async (body) => {
        try {
          const resp = await fetch('/api/api-budget/budget/view/detail/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const text = await resp.text();
          const preview = text.substring(0, 200);
          const hasData = text.includes('"total"') || text.includes('"list"') || text.includes('"data"');
          return { status: resp.status, preview, hasData, bodyPreview: JSON.stringify(body) };
        } catch (e) {
          return { error: e.message };
        }
      }, fmt);
      console.log(`  Format ${JSON.stringify(fmt)}: status=${r.status}, hasData=${r.hasData}, preview=${r.preview}`);
      
      if (r.hasData && r.status === 200) {
        // Found working format! Save the full data
        const fullData = await page.evaluate(async (body) => {
          const resp = await fetch('/api/api-budget/budget/view/detail/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return await resp.text();
        }, fmt);
        
        const outPath = path.join(OUT, 'budget_api_data.json');
        fs.writeFileSync(outPath, fullData);
        console.log(`✓ 数据已保存到 ${outPath} (${fullData.length} bytes)`);
        break;
      }
    }
  }

  // Also try to trigger the query properly via Vue and capture the request
  console.log('[7] 通过Vue触发查询并拦截请求...');
  apiCalls.length = 0; // Clear previous calls
  
  // Click the query button
  await page.locator('button:has-text("查询")').first().click().catch(() => {});
  await sleep(3000);
  
  // Also try Vue method
  await page.evaluate(() => {
    let vm = document.querySelector('.el-form')?.__vue__;
    while (vm) {
      if (vm.$options?.name === 'HProQueryTemplate') {
        if (vm.handleQuery) { vm.handleQuery(); return 'handleQuery'; }
        if (vm.query) { vm.query(); return 'query'; }
      }
      vm = vm.$parent;
    }
    return 'method not found';
  });
  await sleep(5000);

  console.log('Intercepted API calls:');
  apiCalls.forEach(c => {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    Body: ${c.postData}`);
  });

  // Screenshot the final state
  await page.screenshot({ path: path.join(OUT, 'budget_final_state.png'), fullPage: true });
  console.log('Screenshot saved');

  // Wait for user to see
  console.log('\n浏览器保持打开30秒...');
  await sleep(10000);
  
  await browser.close();
  console.log('Done');
})();
