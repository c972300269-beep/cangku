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

  // Intercept ALL API calls
  const allApis = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/api/')) allApis.push({ m: req.method(), u: u.substring(0, 200), p: req.postData()?.substring(0, 500) });
  });
  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('/api/') && (u.includes('query') || u.includes('data') || u.includes('list') || u.includes('search') || u.includes('page') || u.includes('budget'))) {
      try {
        const ct = resp.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const body = await resp.text();
          allApis.push({ type: 'RESP', u: u.substring(0, 200), body: body.substring(0, 1000) });
        }
      } catch {}
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    await page.locator('button:has-text("自动登录")').click(); await sleep(8000);
  }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);

  // Year
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('Year ✓');

  // Now try clicking query with force and intercept the API call
  console.log('\n点击查询 + 拦截API...');
  await page.locator('button:has-text("查询")').first().click({ force: true, timeout: 5000 }).catch(() => {});
  await sleep(15000);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(3000);

  console.log('\n所有API调用:');
  allApis.forEach(a => {
    if (a.type === 'RESP') {
      console.log(`  [RESP] ${a.u}`);
      console.log(`    ${a.body}`);
    } else {
      console.log(`  ${a.m} ${a.u}`);
      if (a.p) console.log(`    POST: ${a.p}`);
    }
  });

  // Try to get data from table
  const tableData = await page.evaluate(() => {
    const rows = document.querySelectorAll('.el-table__body tr');
    return Array.from(rows).map(r => Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim()));
  });
  
  const emptyText = await page.locator('.el-table__empty-text').textContent().catch(() => '');
  console.log(`\n表格: ${tableData.length}行, 空文本: "${emptyText}"`);
  if (tableData.length > 0) {
    tableData.slice(0, 5).forEach((r, i) => console.log(`  [${i}] ${r.join(' | ')}`));
  }

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('✅ budget_result.png');

  // If empty, try making direct API calls
  if (tableData.length === 0) {
    console.log('\n尝试直接API调用...');
    
    // First get org list
    const orgResult = await page.evaluate(async () => {
      try {
        const resp = await fetch('/api/api-budget/doc/budgetOrg/listByUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: {}, pagination: false })
        });
        const data = await resp.json();
        return { ok: true, keys: data ? Object.keys(data) : [], sample: JSON.stringify(data).substring(0, 500) };
      } catch(e) {
        return { error: e.message };
      }
    });
    console.log('Org API:', JSON.stringify(orgResult));

    // Try to figure out the query endpoint
    // Look at page source for API endpoints
    const pageApis = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
      return { scripts: scripts.filter(s => s.includes('app') || s.includes('chunk')).slice(0, 5) };
    });
    console.log('App scripts:', pageApis.scripts);
  }

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
