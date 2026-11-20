const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Try CDP connection first, fall back to launching
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('[0] CDP连接成功');
  } catch {
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--no-first-run', '--window-size=1920,1080'],
    });
    console.log('[0] 启动新浏览器');
  }

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Login
  console.log('[1] 登录...');
  await page.goto('https://xfk.linli580.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(8000);
  console.log('  标题:', await page.title());

  // Monitor API requests to understand the format
  const capturedRequests = [];
  page.on('request', req => {
    if (req.url().includes('budget') && req.url().includes('/list')) {
      capturedRequests.push({
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
        headers: req.headers(),
      });
    }
  });

  // Try to trigger the real query from the page
  console.log('[2] 触发查询...');
  await page.evaluate(() => {
    let vm = document.querySelector('.el-form')?.__vue__;
    while (vm) {
      if (vm.$options?.name === 'HProQueryTemplate') {
        if (vm.handleQuery) { vm.handleQuery(); return 'handleQuery'; }
      }
      vm = vm.$parent;
    }
  });
  await sleep(8000);

  // If handleQuery didn't work, try clicking
  if (capturedRequests.length === 0) {
    console.log('  handleQuery未触发API, 尝试点击按钮...');
    await page.locator('button:has-text("查询")').first().click().catch(() => {});
    await sleep(8000);
  }

  console.log(`  捕获到 ${capturedRequests.length} 个API请求`);
  if (capturedRequests.length > 0) {
    const r = capturedRequests[0];
    console.log(`  URL: ${r.url}`);
    console.log(`  Body: ${r.postData}`);
    console.log(`  Cookie: ${(r.headers || {})['cookie']?.substring(0, 100)}`);
    console.log(`  Authorization: ${(r.headers || {})['authorization']}`);
  }

  // Step 3: Use the captured request format to make direct calls via XMLHttpRequest
  // XHR in page.evaluate WILL carry cookies
  console.log('[3] 通过XHR直接调用API...');

  const xhrResult = await page.evaluate(async (body) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function() {
        resolve({ status: xhr.status, text: xhr.responseText.substring(0, 500), fullLen: xhr.responseText.length });
      };
      xhr.onerror = function() {
        resolve({ error: 'xhr error', status: xhr.status });
      };
      xhr.send(JSON.stringify(body));
    });
  }, { Q_main: { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 });

  console.log(`  XHR result: status=${xhrResult.status}, len=${xhrResult.fullLen}, preview=${xhrResult.text?.substring(0, 150)}`);

  if (xhrResult.status === 200 && xhrResult.fullLen > 100) {
    // Get full data
    const fullData = await page.evaluate(async (body) => {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = () => resolve(xhr.responseText);
        xhr.onerror = () => resolve(JSON.stringify({ error: 'xhr error' }));
        xhr.send(JSON.stringify(body));
      });
    }, { Q_main: { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 });

    const outPath = path.join(OUT, 'budget_api_data.json');
    fs.writeFileSync(outPath, fullData);
    console.log(`\n✓ 数据已保存! ${outPath} (${fullData.length} bytes)`);

    // Parse and show summary
    try {
      const data = JSON.parse(fullData);
      console.log('  结构:', Object.keys(data));
      if (data.total !== undefined) console.log(`  总数: ${data.total}`);
      if (data.list) console.log(`  列表: ${data.list.length} 行`);
      if (data.rows) console.log(`  行数: ${data.rows.length}`);
      if (data.data) console.log(`  数据: ${typeof data.data}`);
    } catch (e) {
      console.log('  预览:', fullData.substring(0, 300));
    }
  } else if (xhrResult.status === 401 || xhrResult.status === 403) {
    console.log('\n  XHR 认证失败, 页面本身可能未登录');
    console.log('  页面标题:', await page.title());
  }

  await browser.close();
  console.log('Done');
})();
