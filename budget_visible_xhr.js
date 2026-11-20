const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';
const PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/bgt_xhr';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--no-first-run', '--window-size=1920,1080'],
  });

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Login
  console.log('[1] 登录...');
  await page.goto('https://xfk.linli580.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(10000);
  const title = await page.title();
  console.log('  标题:', title);

  if (title.includes('403') || title.includes('Forbidden')) {
    console.log('  ❌ 403 - 可见浏览器也被拦截');
    await browser.close();
    return;
  }

  // Try XHR approach with the authenticated page
  console.log('[2] 直接XHR请求...');

  const result = await page.evaluate(async (body) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => resolve({ status: xhr.status || 0, error: 'network error' });
      xhr.timeout = 30000;
      xhr.ontimeout = () => resolve({ error: 'timeout' });
      xhr.send(JSON.stringify(body));
    });
  }, { Q_main: { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 });

  console.log(`  Status: ${result.status}`);
  console.log(`  Response preview: ${(result.text || '').substring(0, 200)}`);

  if (result.status === 200 && result.text && result.text.length > 100) {
    const data = JSON.parse(result.text);
    console.log(`  总记录数: ${data.total || data.page?.total || 'N/A'}`);
    
    const outPath = path.join(OUT, 'budget_api_data.json');
    fs.writeFileSync(outPath, result.text);
    console.log(`  ✓ 已保存: ${outPath} (${result.text.length} bytes)`);
    
    // Now build the HTML report from this data
    console.log('\n[3] 生成报告...');
    
    const rows = data.list || data.rows || data.data || [];
    if (rows.length > 0) {
      console.log(`  数据行: ${rows.length}`);
      console.log(`  第一行keys: ${Object.keys(rows[0]).join(', ')}`);
      
      // Write the data as a simple JSON for now - we can build reports from it
      const summaryPath = path.join(OUT, 'budget_summary.json');
      fs.writeFileSync(summaryPath, JSON.stringify({
        total: data.total || rows.length,
        rows: rows.length,
        sample: rows.slice(0, 3),
      }, null, 2));
      console.log(`  ✓ 摘要已保存: ${summaryPath}`);
    }
  } else {
    // Try fetching with page cookies directly
    console.log('\n  XHR失败, 尝试用page.evaluate拦截真实查询...');
    
    // Try to trigger the real query
    await page.evaluate(() => {
      let vm = document.querySelector('.el-form')?.__vue__;
      while (vm) {
        if (vm.$options?.name === 'HProQueryTemplate' && vm.handleQuery) {
          vm.handleQuery();
          return;
        }
        vm = vm.$parent;
      }
    });
    await sleep(5000);
    
    // Even simpler: just wait and take screenshot
    await page.screenshot({ path: path.join(OUT, 'budget_last_try.png'), fullPage: true });
    console.log('  截图已保存');
  }

  await sleep(3000);
  await browser.close();
  console.log('Done');
})();
