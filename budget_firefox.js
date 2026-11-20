const { firefox } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
const ACCOUNT = '13403';

function wait(page, ms = 1500) { return page.waitForTimeout(ms); }

(async () => {
  console.log('[0] 启动Firefox...');
  const browser = await firefox.launch({
    headless: true,
    args: ['--window-size=1920,1080'],
  });
  
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
    locale: 'zh-CN',
  });
  
  const page = await ctx.newPage();

  try {
    // Login
    console.log('[1] 登录...');
    await page.goto('https://xfk.linli580.cn/eacp/user/login', { 
      waitUntil: 'domcontentloaded', timeout: 60000 
    });
    await wait(page, 8000);
    console.log(`  标题: ${await page.title()}`);
    
    // Check if login form loaded
    const inputs = await page.locator('input').count();
    console.log(`  Inputs: ${inputs}`);
    
    if (inputs >= 2) {
      const pwInputs = await page.locator('input[type="password"]').count();
      console.log(`  Password inputs: ${pwInputs}`);
      
      // Try common selectors
      for (const sel of [
        'input[placeholder*="帐户"]', 'input[placeholder*="账号"]', 'input[placeholder*="用户名"]',
        'input[placeholder*="邮箱"]', 'input[name="username"]', 'input[type="text"]'
      ]) {
        const c = await page.locator(sel).count();
        if (c > 0) console.log(`  Found: ${sel} x${c}`);
      }
      
      // Fill in any text input found
      const textInputs = page.locator('input[type="text"], input:not([type])');
      const pwInput = page.locator('input[type="password"]');
      
      if (await textInputs.count() > 0 && await pwInput.count() > 0) {
        await textInputs.first().fill('chenjialin3');
        await pwInput.first().fill('chenjialin');
        console.log('  ✓ 填写凭据');
        
        // Find login button
        const loginBtn = page.locator('button:has-text("登录"), button:has-text("登 录"), button[type="submit"]').first();
        if (await loginBtn.count() > 0) {
          await loginBtn.click();
          await wait(page, 8000);
          console.log(`  登录后标题: ${await page.title()}`);
        }
      }
    }

    // Navigate to budget page
    console.log('[2] 进入预算明细...');
    await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', { 
      waitUntil: 'domcontentloaded', timeout: 60000 
    });
    await wait(page, 10000);
    console.log(`  标题: ${await page.title()}`);

    // Check form
    const formCount = await page.locator('.el-form-item').count();
    console.log(`  表单项: ${formCount}`);

    if (formCount === 0) {
      console.log('  ⚠ 预算页面未加载, 截图...');
      await page.screenshot({ path: path.join(OUT, 'firefox_budget.png') });
    } else {
      // Select year
      console.log('[3] 选择年份2026...');
      await page.locator('.h-pro-form-item--year input').first().click().catch(() => {});
      await wait(page, 1000);
      const cells = page.locator('.el-year-table td .cell');
      for (let i = 0; i < await cells.count(); i++) {
        if ((await cells.nth(i).textContent()).trim() === '2026') {
          await cells.nth(i).click(); break;
        }
      }
      await wait(page, 1500);

      // Org
      console.log('[4] 选择组织...');
      await page.locator('[class*="budgetOrg"] .el-icon-search, .h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search').first().click().catch(() => {});
      await wait(page, 4000);
      
      const od = page.locator('[aria-label*="预算组织"], [aria-label*="组织"]').first();
      if (await od.count() > 0) {
        await od.locator('.el-tree-node__content').first().waitFor({ timeout: 20000 }).catch(() => {});
        await wait(page, 1500);
        for (const org of ORGS) {
          const nodes = od.locator('.el-tree-node__content');
          for (let i = 0; i < await nodes.count(); i++) {
            if ((await nodes.nth(i).textContent()).includes(org)) {
              await nodes.nth(i).locator('.el-checkbox__input').first().click().catch(() => {});
              console.log(`  ${org}: ✓`);
              await wait(page, 200);
              break;
            }
          }
        }
        // Confirm
        const ob = od.locator('button');
        for (let i = 0; i < await ob.count(); i++) {
          if ((await ob.nth(i).textContent()).includes('确')) {
            await ob.nth(i).click(); break;
          }
        }
        await wait(page, 2000);
        await page.keyboard.press('Escape');
        await wait(page, 1000);
      }

      // Subject
      console.log('[5] 选择科目...');
      await page.locator('[class*="budgetSubject"] .el-icon-search, [title="预算科目"] .el-icon-search').first().click().catch(() => {});
      await wait(page, 4000);
      
      const sd = page.locator('[aria-label*="预算科目"], [aria-label*="科目"]').first();
      if (await sd.count() > 0) {
        await sd.locator('.el-tree-node__content').first().waitFor({ timeout: 20000 }).catch(() => {});
        await wait(page, 1500);
        await sd.locator('input[placeholder*="关键字"]').first().fill(ACCOUNT);
        await wait(page, 500);
        await sd.locator('button[title="查询"]').click().catch(() => {});
        await wait(page, 3000);
        
        const sn = sd.locator('.el-tree-node__content');
        for (let i = 0; i < await sn.count(); i++) {
          if ((await sn.nth(i).textContent()).includes(ACCOUNT)) {
            await sn.nth(i).locator('.el-checkbox__input').first().click().catch(() => {});
            console.log(`  ${ACCOUNT}: ✓`);
            break;
          }
        }
        const sb = sd.locator('button');
        for (let i = 0; i < await sb.count(); i++) {
          if ((await sb.nth(i).textContent()).includes('确')) {
            await sb.nth(i).click(); break;
          }
        }
        await wait(page, 2000);
        await page.keyboard.press('Escape');
        await wait(page, 1000);
      }

      // Query!
      console.log('[6] 查询...');
      await page.locator('button:has-text("查询")').first().click().catch(() => {});
      await wait(page, 15000);
      
      const rows = await page.locator('.el-table__body tbody tr').count();
      console.log(`  结果: ${rows} 行`);
      
      if (rows > 0) {
        // Expand
        console.log('[7] 展开...');
        let r = 0, prev = -1, curr = rows;
        while (r < 10 && curr !== prev) {
          r++; prev = curr;
          await page.evaluate(() => {
            document.querySelectorAll('.el-table__expand-icon').forEach(i => { try { i.click() } catch(e) {} });
          });
          await wait(page, 3000);
          curr = await page.evaluate(() => document.querySelectorAll('.el-table__body tbody tr').length);
          console.log(`  Round ${r}: ${prev} → ${curr}`);
        }
        
        // Extract
        console.log('[8] 提取数据...');
        const data = await page.evaluate(() => {
          const h = [];
          document.querySelectorAll('.el-table__header th').forEach(th => {
            const t = th.textContent.trim();
            if (t) h.push(t);
          });
          const rows = [];
          document.querySelectorAll('.el-table__body tbody tr').forEach(tr => {
            const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
            if (cells.some(c => c)) rows.push(cells);
          });
          return { headers: h, rows };
        });
        
        console.log(`  ${data.headers.length}列 x ${data.rows.length}行`);
        
        // Save
        const jp = path.join(OUT, 'budget_live_data.json');
        fs.writeFileSync(jp, JSON.stringify(data, null, 2));
        
        // Generate HTML
        let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算</title>';
        html += '<style>body{font-family:Arial;margin:15px}table{border-collapse:collapse;font-size:12px}';
        html += 'th,td{border:1px solid #ddd;padding:5px;text-align:right}th{background:#4472C4;color:#fff}';
        html += 'td:first-child,td:nth-child(2){text-align:left}</style></head><body>';
        html += `<h1>2026年预算 - 科目13403</h1><p>${data.rows.length}行 | ${new Date().toLocaleString('zh-CN')}</p>`;
        html += '<table><thead><tr>';
        for (const h of data.headers) html += `<th>${h}</th>`;
        html += '</tr></thead><tbody>';
        for (const row of data.rows) {
          html += '<tr>';
          for (const c of row) html += `<td>${c}</td>`;
          html += '</tr>';
        }
        html += '</tbody></table></body></html>';
        
        const hp = path.join(OUT, 'budget_live_report.html');
        fs.writeFileSync(hp, html);
        console.log(`\n✓ HTML: ${hp}`);
        
        await page.screenshot({ path: path.join(OUT, 'budget_firefox.png'), fullPage: true });
      }
    }
    
    console.log('\n完成!');
  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: path.join(OUT, 'firefox_error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
