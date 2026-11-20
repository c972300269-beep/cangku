const { chromium } = require('playwright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'E:/workbuddy/Claw/reports';

async function safeClose(b) {
  if (!b) return;
  try { await b.close().catch(() => {}); } catch {}
  try { const p = b.process ? b.process() : null; if (p && p.pid) process.kill(p.pid, 'SIGKILL'); } catch {}
}

(async () => {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
      args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--mute-audio']
    });
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 }, locale: 'zh-CN', ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

    console.log('[1] 登录...');
    await page.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil:'domcontentloaded', timeout:30000 });
    await sleep(4000);
    await page.locator('input[placeholder="请输入帐户名或邮箱地址"]').fill('chenjialin3');
    await page.locator('input[placeholder="请输入密码"]').fill('chenjialin');
    await page.locator('button:has-text("登录")').first().click({ timeout:5000 });
    await sleep(5000);

    console.log('[2] 预算明细...');
    await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', { waitUntil:'domcontentloaded', timeout:60000 });
    await sleep(8000);

    // Year
    console.log('[3] 年份2026...');
    await page.locator('.h-pro-form-item--year input.el-input__inner').first().click({ timeout:5000 }).catch(()=>{});
    await sleep(1000);
    for (let i=0; i<await page.locator('.el-year-table td .cell').count(); i++) {
      if ((await page.locator('.el-year-table td .cell').nth(i).textContent()).trim() === '2026') {
        await page.locator('.el-year-table td .cell').nth(i).click(); break;
      }
    }
    await sleep(1000);

    // Orgs
    console.log('[4] 组织...');
    const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
    await page.locator('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search').first().click({ timeout:5000 }).catch(()=>{});
    await sleep(4000);
    await page.evaluate(() => {
      const d = document.querySelector('[aria-label="预算组织（个人）"]');
      if (d) { d.style.display=''; d.style.visibility='visible'; d.style.opacity='1'; }
    });
    await sleep(2000);
    for (const org of ORGS) {
      await page.locator(`[aria-label="预算组织（个人）"]`).locator('.el-tree-node__content').filter({ hasText: org }).first().locator('.el-checkbox__inner').first().click({ timeout:3000 }).catch(()=>{});
      await sleep(300);
    }
    await sleep(1000);
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim()==='确 定') { b.click(); return; }
      }
    });
    await sleep(2000);
    await page.keyboard.press('Escape');
    await sleep(1000);

    // Subject
    console.log('[5] 科目13403...');
    await page.locator('[title="预算科目"] .ref-icon.el-icon-search, .h-pro-form-item--budgetSubject\\.id .ref-icon.el-icon-search').first().click({ timeout:5000 }).catch(()=>{});
    await sleep(4000);
    await page.evaluate(() => {
      const d = document.querySelector('[aria-label="预算科目"]');
      if (d) { d.style.display=''; d.style.visibility='visible'; d.style.opacity='1'; }
    });
    await sleep(2000);
    await page.locator('[aria-label="预算科目"] input[placeholder="请输入关键字"]').first().fill('13403');
    await page.locator('[aria-label="预算科目"] button[title="查询"]').first().click();
    await sleep(3000);
    try {
      await page.locator('[aria-label="预算科目"] .el-tree-node__content').filter({ hasText:'13403' }).first().locator('.el-checkbox__input').first().click({ timeout:3000 });
    } catch(e) {}
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim()==='确 定') { b.click(); return; }
      }
    });
    await sleep(2000);
    await page.evaluate(() => { document.querySelectorAll('.el-dialog__wrapper').forEach(w=>{w.style.display='none';}); });
    await sleep(1000);

    // Query
    console.log('[6] 查询...');
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim()==='查询'||b.textContent.trim()==='查 询') { b.click(); return; }
      }
    });
    await sleep(10000);

    const rowCount = await page.evaluate(() => document.querySelectorAll('.el-table__body tbody tr,.el-table__body-wrapper .el-table__row').length);
    console.log('行数:', rowCount);

    // Expand ONLY rows that have "设备设施维护支出" text
    console.log('[7] 展开13403子层级...');
    await page.evaluate(() => {
      document.querySelectorAll('.el-table__expand-icon').forEach(icon => {
        const row = icon.closest('tr');
        if (row && row.textContent.includes('设备设施维护支出')) {
          try { icon.click(); } catch(e) {}
        }
      });
    });
    await sleep(3000);

    const expandedCount = await page.evaluate(() => document.querySelectorAll('.el-table__body tbody tr,.el-table__body-wrapper .el-table__row').length);
    console.log('展开后行数:', expandedCount);

    // Extract
    console.log('[8] 提取...');
    const data = await page.evaluate(() => {
      const headers = [];
      document.querySelectorAll('.el-table__header th').forEach(th => {
        const t = (th.textContent||'').trim();
        if (t) headers.push(t);
      });
      const rows = [];
      // Use :scope to avoid nested table rows
      document.querySelectorAll('.el-table__body > table > tbody > tr, .el-table__body-wrapper > table > tbody > tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim());
        if (cells.some(c => c)) rows.push(cells);
      });
      // Fallback
      if (rows.length === 0) {
        document.querySelectorAll('.el-table__body tbody tr').forEach(tr => {
          const cells = [...tr.querySelectorAll('td')].map(td => (td.textContent||'').trim());
          if (cells.some(c => c)) rows.push(cells);
        });
      }
      return { headers, rows };
    });

    console.log(headers.length + '列 x ' + data.rows.length + '行');
    
    // Save
    fs.writeFileSync(OUT+'/budget_latest.json', JSON.stringify({ headers:data.headers, rows:data.rows },null,2));

    // Print all rows
    console.log('\n=== 展开后所有行 ===');
    data.rows.forEach((r,i) => {
      console.log(`[${i}] ${r.slice(0,5).join(' | ')}`);
    });

  } finally {
    await safeClose(browser);
  }
})().catch(e => console.error(e));
