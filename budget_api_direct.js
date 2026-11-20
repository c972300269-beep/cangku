const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Step 1: Login
  console.log('[1] 登录...');
  await page.goto('https://xfk.linli580.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(8000);
  const title = await page.title();
  console.log('  页面标题:', title);

  // Step 2: Try to hit the query API directly - we just need the session cookies
  // First, find the API URL by triggering a query
  console.log('[2] 探索API端点...');
  
  // Monitor all API requests
  let queryApiUrl = null;
  let queryApiBody = null;
  
  page.on('request', req => {
    const url = req.url();
    if (url.includes('budget') && (url.includes('/list') || url.includes('/query') || url.includes('/detail'))) {
      if (req.method() === 'POST') {
        queryApiUrl = url;
        queryApiBody = req.postData();
        console.log(`  API: ${req.method()} ${url}`);
        if (queryApiBody) console.log(`  Body: ${queryApiBody}`);
      }
    }
  });

  // Try to trigger query via Vue
  await page.evaluate(() => {
    let vm = document.querySelector('.el-form')?.__vue__;
    while (vm) {
      if (vm.$options?.name === 'HProQueryTemplate') {
        if (vm.handleQuery) { vm.handleQuery(); return 'handleQuery'; }
        if (vm.query) { vm.query(); return 'query'; }
      }
      vm = vm.$parent;
    }
    return 'no method';
  });
  await sleep(6000);

  if (!queryApiUrl) {
    // Try clicking the query button
    console.log('  handleQuery未触发API, 尝试点击查询按钮...');
    await page.locator('button:has-text("查询")').first().click().catch(() => {});
    await sleep(6000);
  }

  console.log(`  API URL: ${queryApiUrl || 'NOT FOUND'}`);
  console.log(`  API Body: ${queryApiBody || 'NOT FOUND'}`);

  // Step 3: Try different API parameter formats
  console.log('[3] 尝试直接API调用...');

  const apiBase = queryApiUrl || '/api/api-budget/budget/view/detail/list';
  
  const tryFormats = [
    // From previous debugging: PERIOD=0 was the default
    { Q_main: { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 },
    { Q_main: { PERIOD_S_EQ: '2026', ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 },
    { Q_main: { PERIOD_S_EQ: 2026 }, page: 0, size: 500 },
    // Try URL params format
    { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403', page: 0, size: 500 },
    // Try with different field names
    { Q_main: { PERIOD_S_EQ: '2026', BUDGET_ORG_S_IN: ORGS, BUDGET_ACCOUNT_S_EQ: '13403' }, page: 0, size: 500 },
    { Q_main: { PERIOD_S_EQ: '2026', budgetOrgId: ORGS, budgetAccountId: '13403' }, page: 0, size: 500 },
    // Try the exact format we saw in earlier debugging
    { Q_main: { PERIOD_S_EQ: '2026' }, page: 0, size: 500 },
  ];

  let foundData = false;
  for (const body of tryFormats) {
    const r = await page.evaluate(async ({ url, body }) => {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await resp.text();
        const preview = text.substring(0, 300);
        return { status: resp.status, text: preview, fullLen: text.length };
      } catch (e) {
        return { error: e.message };
      }
    }, { url: apiBase, body });
    
    const hasData = r.text && (r.text.includes('"total"') || r.text.includes('"list"') || r.text.includes('"rows"') || r.text.includes('"records"'));
    console.log(`  ${JSON.stringify(body).substring(0, 80)}... => status=${r.status}, hasData=${hasData}, len=${r.fullLen}, preview=${r.text?.substring(0, 100)}`);
    
    if (r.status === 200 && r.fullLen > 10) {
      const outPath = path.join(OUT, 'budget_api_data.json');
      fs.writeFileSync(outPath, r.text);
      console.log(`\n✓ 数据已保存! ${outPath} (${r.fullLen} bytes)`);
      foundData = true;
      break;
    }
  }

  if (!foundData) {
    console.log('\n直接API调用均失败, 尝试获取CSRF token...');
    // Maybe we need CSRF token
    const csrf = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="_csrf"]');
      if (meta) return meta.content;
      const token = document.querySelector('input[name="_csrf"]');
      if (token) return token.value;
      return document.cookie;
    });
    console.log(`  CSRF/Cookie: ${csrf?.substring(0, 100)}`);
  }

  await browser.close();
  console.log('Done');
})();
