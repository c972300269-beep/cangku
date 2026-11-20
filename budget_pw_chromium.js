const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
const ACCOUNT = '13403';

function wait(page, ms = 1500) { return page.waitForTimeout(ms); }

(async () => {
  // Try Playwright's Chromium instead of system Chrome
  console.log('[0] 启动Playwright Chromium...');
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ]
  });
  
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    delete Object.getPrototypeOf(navigator).webdriver;
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log('[1] 登录...');
    
    // Monitor network for the actual login API
    let loginApiUrl = null;
    page.on('request', req => {
      const u = req.url();
      if (u.includes('/login') && u.includes('/api/')) {
        loginApiUrl = u;
        console.log(`  Login API: ${req.method()} ${u}`);
        console.log(`  Body: ${req.postData()}`);
      }
    });

    await page.goto('https://xfk.linli580.cn/eacp/user/login', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await wait(page, 8000);
    
    const title = await page.title();
    console.log(`  标题: ${title}`);

    // Check if we got the login form
    const hasInput = await page.locator('input').count();
    console.log(`  Input fields: ${hasInput}`);

    if (hasInput > 0) {
      // Fill credentials
      await page.locator('input[placeholder="请输入帐户名或邮箱地址"]').fill('chenjialin3');
      await page.locator('input[placeholder="请输入密码"]').fill('chenjialin');
      await page.locator('button:has-text("登录")').first().click();
      await wait(page, 8000);
      
      console.log('  ✓ 登录完成');
      console.log(`  登录API: ${loginApiUrl || '未捕获'}`);
    } else {
      console.log('  ⚠ 无登录表单, 检查页面状态...');
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
      console.log(`  Body: ${bodyText}`);
      await page.screenshot({ path: path.join(OUT, 'login_state.png') });
    }

    // Navigate to budget page
    console.log('[2] 进入预算明细...');
    await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await wait(page, 10000);
    console.log(`  标题: ${await page.title()}`);

    // Check if we're on the budget page
    const formItems = await page.locator('.el-form-item').count();
    console.log(`  表单项: ${formItems}`);

    if (formItems === 0) {
      console.log('  ⚠ 未找到表单, 可能未登录或页面加载失败');
      await page.screenshot({ path: path.join(OUT, 'budget_state.png') });
    }

    // Year
    console.log('[3] 选择年份2026...');
    await page.locator('.h-pro-form-item--year input.el-input__inner').first().click();
    await wait(page, 1000);
    const yearCells = page.locator('.el-year-table td .cell');
    for (let i = 0; i < await yearCells.count(); i++) {
      if ((await yearCells.nth(i).textContent()).trim() === '2026') {
        await yearCells.nth(i).click();
        break;
      }
    }
    await wait(page, 1500);

    // Org
    console.log('[4] 选择预算组织...');
    await page.locator('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search').first().click();
    await wait(page, 4000);
    
    const od = page.locator('[aria-label="预算组织（个人）"]').first();
    if (await od.count() > 0) {
      await od.locator('.el-tree-node__content').first().waitFor({ state: 'visible', timeout: 20000 });
      await wait(page, 1500);

      for (const org of ORGS) {
        const nodes = od.locator('.el-tree-node__content');
        for (let i = 0; i < await nodes.count(); i++) {
          if ((await nodes.nth(i).textContent()).includes(org)) {
            await nodes.nth(i).locator('.el-checkbox__input').first().click();
            await wait(page, 200);
            console.log(`  ${org}: ✓`);
            break;
          }
        }
      }
      
      const orgBtns = od.locator('button');
      for (let i = 0; i < await orgBtns.count(); i++) {
        if ((await orgBtns.nth(i).textContent()).trim() === '确 定') {
          await orgBtns.nth(i).click();
          break;
        }
      }
      await wait(page, 2000);
      await page.keyboard.press('Escape');
      await wait(page, 1000);
    }

    // Subject
    console.log('[5] 选择预算科目...');
    await page.locator('.h-pro-form-item--budgetSubject\\.id .ref-icon.el-icon-search, .h-pro-form-item[title="预算科目"] .ref-icon.el-icon-search').first().click();
    await wait(page, 4000);
    
    const sd = page.locator('[aria-label="预算科目"]').first();
    if (await sd.count() > 0) {
      await sd.locator('.el-tree-node__content').first().waitFor({ state: 'visible', timeout: 20000 });
      await wait(page, 1500);
      await sd.locator('input[placeholder="请输入关键字"]').first().fill(ACCOUNT);
      await wait(page, 500);
      await sd.locator('button[title="查询"]').click();
      await wait(page, 3000);
      
      const sn = sd.locator('.el-tree-node__content');
      for (let i = 0; i < await sn.count(); i++) {
        if ((await sn.nth(i).textContent()).includes(ACCOUNT)) {
          await sn.nth(i).locator('.el-checkbox__input').first().click();
          console.log(`  ${ACCOUNT}: ✓`);
          break;
        }
      }
      
      const sb = sd.locator('button');
      for (let i = 0; i < await sb.count(); i++) {
        if ((await sb.nth(i).textContent()).trim() === '确 定') {
          await sb.nth(i).click();
          break;
        }
      }
      await wait(page, 2000);
      await page.keyboard.press('Escape');
      await wait(page, 1000);
    }

    // Query!
    console.log('[6] 查询...');
    await page.locator('.query-inner-op button:has-text("查询")').first().click();
    await wait(page, 15000);
    
    // Check results
    const rowCount = await page.evaluate(() => 
      document.querySelectorAll('.el-table__body tbody tr').length
    );
    console.log(`  结果行数: ${rowCount}`);

    // Expand
    console.log('[7] 展开数据...');
    let prev = -1, curr = rowCount, round = 0;
    while (round < 10) {
      round++; prev = curr;
      await page.evaluate(() => {
        document.querySelectorAll('.el-table__expand-icon').forEach(i => { try { i.click() } catch(e) {} });
        document.querySelectorAll('.el-table').forEach(t => {
          if (t.__vue__?.store) {
            (t.__vue__.store.states.data || []).forEach(r => {
              try { t.__vue__.toggleRowExpansion(r, true) } catch(e) {}
            });
          }
        });
      });
      await wait(page, 3000);
      curr = await page.evaluate(() => document.querySelectorAll('.el-table__body tbody tr').length);
      console.log(`  ${round}: ${prev} → ${curr}`);
      if (curr === prev) break;
    }

    // Extract
    console.log('[8] 提取数据...');
    const tableData = await page.evaluate(() => {
      const headers = [];
      document.querySelectorAll('.el-table__header th').forEach(th => {
        const t = th.textContent.trim();
        if (t) headers.push(t);
      });
      const rows = [];
      document.querySelectorAll('.el-table__body tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        if (cells.some(c => c)) rows.push(cells);
      });
      return { headers, rows };
    });
    
    console.log(`  ${tableData.headers.length} 列 x ${tableData.rows.length} 行`);

    // Save JSON
    const jsonPath = path.join(OUT, 'budget_live_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(tableData, null, 2));
    console.log(`  ✓ JSON: ${jsonPath}`);

    // Generate HTML
    if (tableData.rows.length > 0) {
      console.log('[9] 生成HTML...');
      const { headers, rows } = tableData;
      let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算报告</title>';
      html += '<style>body{font-family:Arial;margin:15px}h1{color:#333}';
      html += 'table{border-collapse:collapse;font-size:12px;width:100%}';
      html += 'th,td{border:1px solid #ddd;padding:5px 7px;text-align:right;white-space:nowrap}';
      html += 'th{background:#4472C4;color:#fff;position:sticky;top:0}';
      html += 'td:first-child,td:nth-child(2){text-align:left}';
      html += 'tr:nth-child(even){background:#fafafa}</style></head><body>';
      html += `<h1>2026年预算数据 - 科目13403</h1>`;
      html += `<p>${rows.length}行 | 4个组织 | ${new Date().toLocaleString('zh-CN')}</p>`;
      html += '<table><thead><tr>';
      for (const h of headers) html += `<th>${h}</th>`;
      html += '</tr></thead><tbody>';
      for (const row of rows) {
        html += '<tr>';
        for (const cell of row) html += `<td>${cell}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table></body></html>';
      
      const htmlPath = path.join(OUT, 'budget_live_report.html');
      fs.writeFileSync(htmlPath, html);
      console.log(`  ✓ HTML: ${htmlPath}`);
    }

    await page.screenshot({ path: path.join(OUT, 'budget_live.png'), fullPage: true });
    console.log('  ✓ 截图完成');

  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: path.join(OUT, 'budget_error.png') }).catch(() => {});
  } finally {
    await browser.close();
    console.log('\n全部完成!');
  }
})();
