const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';
// Use the Chrome profile that was working before
const PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_bgt';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (fs.existsSync(PROFILE)) {
    console.log('[0] 使用已有Chrome profile (可能已登录)');
  } else {
    fs.mkdirSync(PROFILE, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    channel: 'chrome',
    args: [
      '--no-first-run',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ],
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = context.pages()[0] || await context.newPage();

  // Check if already on budget page
  console.log('[1] 导航到预算系统...');
  await page.goto('https://xfk.linli580.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(8000);
  
  const title = await page.title();
  console.log('  标题:', title);

  if (title.includes('403')) {
    console.log('  需要登录, 请在浏览器中手动登录...');
    console.log('  等待60秒...');
    await sleep(60000);
    const title2 = await page.title();
    if (title2.includes('403')) {
      console.log('  ❌ 登录失败');
      await context.close();
      return;
    }
  }

  // OK, we're on the page. Now try XHR
  console.log('[2] XHR直接请求数据...');
  
  const result = await page.evaluate(async (body) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => resolve({ error: 'xhr failed' });
      xhr.timeout = 30000;
      xhr.ontimeout = () => resolve({ error: 'timeout' });
      xhr.send(JSON.stringify(body));
    });
  }, { Q_main: { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 });

  console.log(`  Status: ${result.status}`);
  console.log(`  Preview: ${(result.text || result.error || '').substring(0, 300)}`);

  if (result.status === 200 && result.text && result.text.length > 100) {
    try {
      const data = JSON.parse(result.text);
      const rows = data.list || data.rows || data.data || data.records || [];
      console.log(`  总记录数: ${data.total || rows.length}`);
      
      const outPath = path.join(OUT, 'budget_api_data.json');
      fs.writeFileSync(outPath, result.text);
      console.log(`  ✓ 保存: ${outPath} (${result.text.length} bytes)`);
      
      // Generate the HTML report
      await generateReport(data, rows);
    } catch (e) {
      console.log(`  解析错误: ${e.message}`);
    }
  } else {
    // Try without params to see what the API expects
    console.log('\n  尝试不带参数...');
    const r2 = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText.substring(0, 500) });
        xhr.onerror = () => resolve({ error: 'failed' });
        xhr.send(JSON.stringify({ page: 0, size: 10 }));
      });
    });
    console.log(`  空参数: status=${r2.status}, ${r2.text}`);
  }

  console.log('\nDone');
  await context.close();
})();

async function generateReport(data, rows) {
  // Build HTML report
  console.log('[3] 生成HTML报告...');
  
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  console.log(`  列: ${headers.join(', ')}`);
  
  // Simple HTML table
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算数据</title>
<style>body{font-family:Arial;margin:20px}h1{color:#333}table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:right;white-space:nowrap}
th{background:#4472C4;color:#fff;position:sticky;top:0}
td:first-child,td:nth-child(2){text-align:left}
tr:hover{background:#f5f5f5}
.summary{background:#e8f0fe;padding:15px;margin-bottom:20px;border-radius:4px}
.summary strong{color:#1a73e8}</style></head><body>
<h1>2026年预算数据 - 科目13403 设备设施维护支出</h1>
<div class="summary"><strong>${rows.length}行</strong> | 4个组织 | ${new Date().toLocaleString('zh-CN')}</div>
<table><thead><tr>`;

  for (const h of headers) {
    html += `<th>${h}</th>`;
  }
  html += '</tr></thead><tbody>';
  
  for (const row of rows) {
    html += '<tr>';
    for (const h of headers) {
      const v = row[h];
      html += `<td>${v !== null && v !== undefined ? v : ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></body></html>';
  
  const reportPath = path.join(OUT, 'budget_live_report.html');
  fs.writeFileSync(reportPath, html);
  console.log(`  ✓ 报告: ${reportPath}`);
}
