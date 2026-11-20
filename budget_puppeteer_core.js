const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Use puppeteer-core with Playwright's Chromium
const { addExtra } = require('puppeteer-extra');
const vanillaPuppeteer = require('puppeteer-core');

const CHROMIUM_PATH = 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
// Try the system Chrome too
const SYSTEM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Try Playwright's Chromium first, then system Chrome
  let execPath = CHROMIUM_PATH;
  if (!fs.existsSync(execPath)) {
    execPath = SYSTEM_CHROME;
    if (!fs.existsSync(execPath)) {
      console.log('No Chromium found');
      return;
    }
  }
  console.log('Using:', execPath);

  const browser = await vanillaPuppeteer.launch({
    headless: true,
    executablePath: execPath,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    console.log('[1] 访问登录页...');
    await page.goto('https://xfk.linli580.cn/eacp/user/login', { 
      waitUntil: 'networkidle2', timeout: 60000 
    });
    await wait(5000);
    
    const title = await page.title();
    console.log('  标题:', title);

    if (!title.includes('403') && !title.includes('Forbidden')) {
      console.log('  ✓ 成功!');

      // Wait for login form
      await page.waitForSelector('input', { timeout: 15000 }).catch(() => {});
      await wait(3000);

      // Fill credentials
      const textInputs = await page.$$('input[type="text"], input:not([type])');
      const pwInputs = await page.$$('input[type="password"]');
      
      if (textInputs.length > 0 && pwInputs.length > 0) {
        console.log('  填写登录...');
        await textInputs[0].type('chenjialin3');
        await pwInputs[0].type('chenjialin');
        
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (text.includes('登录')) { await btn.click(); break; }
        }
        await wait(8000);
        console.log('  登录后:', await page.title());
      }

      // Go to budget
      console.log('[2] 进入预算...');
      await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', {
        waitUntil: 'networkidle2', timeout: 60000
      });
      await wait(10000);
      console.log('  标题:', await page.title());

      // Year
      console.log('[3] 选年份...');
      const yearInputs = await page.$$('.h-pro-form-item--year input');
      if (yearInputs.length > 0) {
        await yearInputs[0].click();
        await wait(1000);
        const cells = await page.$$('.el-year-table td .cell');
        for (const c of cells) {
          const t = await page.evaluate(el => el.textContent, c);
          if (t.trim() === '2026') { await c.click(); break; }
        }
      }
      await wait(1500);

      // Org
      console.log('[4] 选组织...');
      const orgIcons = await page.$$('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search');
      if (orgIcons.length > 0) {
        await orgIcons[0].click();
        await wait(4000);
        
        // Wait for tree nodes
        await page.waitForSelector('.el-tree-node__content', { timeout: 20000 }).catch(() => {});
        await wait(1500);
        
        const nodes = await page.$$('.el-tree-node__content');
        for (const code of ORGS) {
          for (const node of nodes) {
            const text = await page.evaluate(el => el.textContent, node);
            if (text.includes(code)) {
              const cb = await node.$('.el-checkbox__input');
              if (cb) { await cb.click(); console.log('  ' + code); }
              break;
            }
          }
        }
        
        // Confirm via evaluate
        await page.evaluate(() => {
          const dlgs = document.querySelectorAll('.el-dialog__wrapper');
          for (const dlg of dlgs) {
            if (dlg.style.display !== 'none' && dlg.offsetParent !== null) {
              const btns = dlg.querySelectorAll('button');
              for (const b of btns) {
                if (b.textContent.trim() === '确 定' || b.textContent.trim() === '确定') {
                  b.click();
                  return;
                }
              }
            }
          }
        });
        await wait(2000);
        await page.keyboard.press('Escape');
        await wait(1000);
      }

      // Subject - try multiple selectors
      console.log('[5] 选科目...');
      
      // Debug: find the correct subject icon
      const allIcons = await page.evaluate(() => {
        const icons = document.querySelectorAll('.el-icon-search, [class*="icon-search"], [class*="ref-icon"]');
        const info = [];
        icons.forEach((icon, i) => {
          const parent = icon.closest('.el-form-item, .h-pro-form-item');
          const label = parent ? parent.textContent.trim().substring(0, 50) : 'no parent';
          info.push({ i, label, classes: icon.className });
        });
        return info;
      });
      console.log('  Search icons:', JSON.stringify(allIcons));

      // Try clicking the subject icon using evaluate
      const clicked = await page.evaluate(() => {
        // Find the form item with '预算科目' or '科目' text
        const items = document.querySelectorAll('.el-form-item, .h-pro-form-item');
        for (const item of items) {
          const text = item.textContent || '';
          if (text.includes('预算科目') || text.includes('科目')) {
            const icon = item.querySelector('.el-icon-search, [class*="icon-search"], [class*="ref-icon"]');
            if (icon) { icon.click(); return text.trim().substring(0, 40); }
          }
        }
        return false;
      });
      console.log('  Subject click:', clicked);

      if (clicked) {
        await wait(4000);
        
        // Wait for tree
        try { await page.waitForSelector('.el-tree-node__content', { timeout: 20000 }); } catch(e) {}
        await wait(3000);
        
        // Debug tree
        const treeDebug = await page.evaluate(() => {
          const nodes = document.querySelectorAll('.el-tree-node__content');
          return nodes.length;
        });
        console.log('  Tree nodes:', treeDebug);
        console.log('  DEBUG: treeDebug type:', typeof treeDebug, 'val:', treeDebug);
        
        try {
        if (treeDebug > 0) {
          console.log('  DEBUG: entering if block');
          // Search and select
          console.log('  ACCOUNT var:', ACCOUNT);
          const searchInput = await page.$('input[placeholder*="关键字"]');
          console.log('  searchInput:', !!searchInput);
          if (searchInput) {
            await searchInput.click();
            const accStr = String(ACCOUNT);
            await searchInput.type(accStr);
            await wait(800);
          }
          
          // Click search button
          await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
              if (b.textContent.includes('查询') || b.title === '查询') { b.click(); return; }
            }
          });
          await wait(3000);
          
          // Find and click 13403
          const found = await page.evaluate((code) => {
            const nodes = document.querySelectorAll('.el-tree-node__content');
            const total = nodes.length;
            for (const n of nodes) {
              if (n.textContent.trim() === code || n.textContent.trim().startsWith(code)) {
                const cb = n.querySelector('.el-checkbox__input');
                if (cb) { cb.click(); return true; }
                return false;
              }
            }
            for (const n of nodes) {
              if (n.textContent.includes(code)) {
                const cb = n.querySelector('.el-checkbox__input');
                if (cb) { cb.click(); return true; }
              }
            }
            if (total === 1) {
              const cb = document.querySelector('.el-tree-node__content .el-checkbox__input');
              if (cb) { cb.click(); return true; }
            }
            return false;
          }, ACCOUNT);
          
          console.log('  13403 found:', found);
          
          // Confirm
          await page.evaluate(() => {
            const dlgs = document.querySelectorAll('.el-dialog__wrapper');
            for (const dlg of dlgs) {
              if (dlg.style.display !== 'none' && dlg.offsetParent !== null) {
                const btns = dlg.querySelectorAll('button');
                for (const b of btns) {
                  if (b.textContent.trim() === '确 定' || b.textContent.trim() === '确定') {
                    b.click(); return;
                  }
                }
              }
            }
          });
          await wait(2000);
          await page.keyboard.press('Escape');
          await wait(1000);
        }
      }

      // Query
      console.log('[6] 查询...');
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          if (b.textContent.trim() === '查询') { b.click(); return; }
        }
        // Try query-inner-op
        const qb = document.querySelector('.query-inner-op button');
        if (qb) qb.click();
      });
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
          console.log('  Round ' + r + ': ' + prev + ' -> ' + curr);
        }

        // Extract data
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

        // Save
        const jp = path.join(OUT, 'budget_live_data.json');
        fs.writeFileSync(jp, JSON.stringify(data, null, 2));
        
        let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算</title>';
        html += '<style>body{font:Arial;margin:15px}table{border-collapse:collapse;font-size:12px}';
        html += 'th,td{border:1px solid #ddd;padding:5px;text-align:right}th{background:#4472C4;color:#fff}';
        html += 'td:first-child,td:nth-child(2){text-align:left}</style></head><body>';
        html += '<h1>2026年预算 - 科目13403</h1><p>' + data.rows.length + '行</p>';
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
        
        console.log('\n✓ 成功!');
        console.log('  JSON: ' + jp);
        console.log('  HTML: ' + hp);
      }

    } else {
      console.log('  ❌ 仍然被拦截');
      await page.screenshot({ path: path.join(OUT, 'stealth_fail.png') });
    }

  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
  } finally {
    await browser.close();
  }
})();
