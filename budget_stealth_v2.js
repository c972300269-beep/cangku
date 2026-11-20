const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
const ACCOUNT = '13403';

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('[0] 启动Stealth浏览器...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  try {
    console.log('[1] 登录...');
    await page.goto('https://xfk.linli580.cn/eacp/user/login', { 
      waitUntil: 'networkidle2', timeout: 60000 
    });
    await wait(5000);
    
    const title = await page.title();
    console.log('  标题:', title);

    if (title.includes('403')) {
      console.log('  ❌ Stealth也403, 尝试visible模式...');
      await browser.close();
      
      const browser2 = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--window-size=1920,1080'],
      });
      const page2 = await browser2.newPage();
      await page2.setViewport({ width: 1920, height: 1080 });
      await page2.goto('https://xfk.linli580.cn/eacp/user/login', { timeout: 60000 });
      await wait(8000);
      console.log('  标题2:', await page2.title());
      await browser2.close();
      return;
    }

    // Fill login form
    console.log('  填写凭据...');
    await page.waitForSelector('input', { timeout: 10000 });
    
    // Find username input
    const inputs = await page.$$('input');
    console.log('  输入框数量:', inputs.length);
    
    // Take screenshot to debug
    await page.screenshot({ path: path.join(OUT, 'stealth_login.png') });
    console.log('  截图保存');

    // Try filling using placeholder
    try {
      await page.type('input[placeholder*="帐户"]', 'chenjialin3');
      await page.type('input[placeholder*="密码"]', 'chenjialin');
    } catch (e) {
      // Try first two inputs
      if (inputs.length >= 2) {
        await inputs[0].type('chenjialin3');
        await inputs[1].type('chenjialin');
      }
    }

    // Click login
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('登录') || text.includes('登 录')) {
        await btn.click();
        break;
      }
    }
    
    await wait(8000);
    console.log('  登录后标题:', await page.title());
    console.log('  当前URL:', page.url());

    // Go to budget page
    console.log('[2] 进入预算...');
    await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', {
      waitUntil: 'networkidle2', timeout: 60000
    });
    await wait(10000);
    console.log('  标题:', await page.title());

    // Year
    console.log('[3] 选择年份...');
    await page.click('.h-pro-form-item--year input.el-input__inner');
    await wait(1000);
    const yearCells = await page.$$('.el-year-table td .cell');
    for (const cell of yearCells) {
      const text = await page.evaluate(el => el.textContent, cell);
      if (text.trim() === '2026') { await cell.click(); break; }
    }
    await wait(1500);

    // Org
    console.log('[4] 选择组织...');
    await page.click('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search');
    await wait(4000);
    
    // Find dialog
    const orgDialog = await page.$('[aria-label="预算组织（个人）"]');
    if (orgDialog) {
      await page.waitForSelector('.el-tree-node__content', { timeout: 20000 });
      await wait(1500);
      
      const nodes = await page.$$('.el-tree-node__content');
      for (const code of ORGS) {
        for (const node of nodes) {
          const text = await page.evaluate(el => el.textContent, node);
          if (text.includes(code)) {
            const cb = await node.$('.el-checkbox__input');
            if (cb) { await cb.click(); console.log('  ' + code + ': ✓'); }
            break;
          }
        }
      }
      
      // Confirm
      const ob = await orgDialog.$$('button');
      for (const b of ob) {
        const t = await page.evaluate(el => el.textContent, b);
        if (t.includes('确')) { await b.click(); break; }
      }
      await wait(2000);
      await page.keyboard.press('Escape');
      await wait(1000);
    }

    // Subject
    console.log('[5] 选择科目...');
    await page.click('.h-pro-form-item--budgetSubject\\.id .ref-icon.el-icon-search');
    await wait(4000);
    
    const subDialog = await page.$('[aria-label="预算科目"]');
    if (subDialog) {
      await page.waitForSelector('.el-tree-node__content', { timeout: 20000 });
      await wait(1500);
      await page.type('input[placeholder*="关键字"]', ACCOUNT);
      await wait(500);
      await page.click('button[title="查询"]');
      await wait(3000);
      
      const sn = await page.$$('.el-tree-node__content');
      for (const node of sn) {
        const text = await page.evaluate(el => el.textContent, node);
        if (text.includes(ACCOUNT)) {
          const cb = await node.$('.el-checkbox__input');
          if (cb) { await cb.click(); console.log('  ' + ACCOUNT + ': ✓'); }
          break;
        }
      }
      
      const sb = await subDialog.$$('button');
      for (const b of sb) {
        const t = await page.evaluate(el => el.textContent, b);
        if (t.includes('确')) { await b.click(); break; }
      }
      await wait(2000);
      await page.keyboard.press('Escape');
      await wait(1000);
    }

    // Query
    console.log('[6] 查询...');
    const queryBtns = await page.$$('.query-inner-op button');
    for (const b of queryBtns) {
      const t = await page.evaluate(el => el.textContent, b);
      if (t.includes('查询')) { await b.click(); break; }
    }
    await wait(15000);
    
    const rowCount = await page.evaluate(() => 
      document.querySelectorAll('.el-table__body tbody tr').length
    );
    console.log('  行数:', rowCount);

    if (rowCount > 0) {
      // Expand
      console.log('[7] 展开...');
      let prev = -1, curr = rowCount;
      for (let r = 0; r < 10 && curr !== prev; r++) {
        prev = curr;
        await page.evaluate(() => {
          document.querySelectorAll('.el-table__expand-icon').forEach(i => { try { i.click() } catch(e) {} });
        });
        await wait(3000);
        curr = await page.evaluate(() => document.querySelectorAll('.el-table__body tbody tr').length);
        console.log('  Round ' + r + ': ' + prev + ' → ' + curr);
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

      console.log('  ' + data.headers.length + '列 x ' + data.rows.length + '行');

      // Save & generate report
      const jp = path.join(OUT, 'budget_live_data.json');
      fs.writeFileSync(jp, JSON.stringify(data, null, 2));

      let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算</title>';
      html += '<style>body{font:Arial;margin:15px}table{border-collapse:collapse;font-size:12px}';
      html += 'th,td{border:1px solid #ddd;padding:5px;text-align:right}th{background:#4472C4;color:#fff}';
      html += 'td:first-child,td:nth-child(2){text-align:left}</style></head><body>';
      html += '<h1>2026年预算</h1><p>' + data.rows.length + '行 | ' + new Date().toLocaleString('zh-CN') + '</p>';
      html += '<table><thead><tr>';
      for (const h of data.headers) html += '<th>' + h + '</th>';
      html += '</tr></thead><tbody>';
      for (const row of data.rows) {
        html += '<tr>';
        for (const c of row) html += '<td>' + c + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></body></html>';
      
      const hp = path.join(OUT, 'budget_live_report.html');
      fs.writeFileSync(hp, html);
      
      console.log('\n✓ 完成!');
      console.log('  JSON: ' + jp);
      console.log('  HTML: ' + hp);
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
