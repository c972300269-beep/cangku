const { chromium } = require('playwright');
const fs = require('fs');
const s = ms => new Promise(r => setTimeout(r, ms));

async function safeClose(b) {
  if (!b) return;
  try { await b.close().catch(()=>{}); } catch {}
  try { const p = b.process ? b.process() : null; if (p&&p.pid) process.kill(p.pid,'SIGKILL'); } catch {}
}

(async () => {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
      args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, locale:'zh-CN', ignoreHTTPSErrors:true });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => { Object.defineProperty(navigator,'webdriver',{get:()=>false}); });

    console.log('Login...');
    await pg.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil:'domcontentloaded', timeout:30000 });
    await s(4000);
    await pg.locator('input[placeholder="请输入帐户名或邮箱地址"]').fill('chenjialin3');
    await pg.locator('input[placeholder="请输入密码"]').fill('chenjialin');
    await pg.locator('button:has-text("登录")').first().click(); await s(5000);

    console.log('Budget page...');
    await pg.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', { waitUntil:'domcontentloaded', timeout:60000 });
    await s(8000);
    
    // Year
    await pg.locator('.h-pro-form-item--year input.el-input__inner').first().click().catch(()=>{}); await s(1000);
    for (let i=0; i<await pg.locator('.el-year-table td .cell').count(); i++) {
      if ((await pg.locator('.el-year-table td .cell').nth(i).textContent()).trim()==='2026') {
        await pg.locator('.el-year-table td .cell').nth(i).click(); break;
      }
    } await s(1000);

    // Orgs
    await pg.locator('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search').first().click().catch(()=>{}); await s(4000);
    await pg.evaluate(()=>{const d=document.querySelector('[aria-label="预算组织（个人）"]');if(d){d.style.display='';d.style.visibility='visible';d.style.opacity='1';}}); await s(2000);
    for (const org of ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002']) {
      await pg.locator('[aria-label="预算组织（个人）"]').locator('.el-tree-node__content').filter({hasText:org}).first().locator('.el-checkbox__inner').first().click().catch(()=>{}); await s(300);
    } await s(1000);
    await pg.evaluate(()=>{for(const b of document.querySelectorAll('button')){if(b.textContent.trim()==='确 定'){b.click();return;}}}); await s(2000);
    await pg.keyboard.press('Escape'); await s(1000);

    // Subject
    await pg.locator('[title="预算科目"] .ref-icon.el-icon-search').first().click().catch(()=>{}); await s(4000);
    await pg.evaluate(()=>{const d=document.querySelector('[aria-label="预算科目"]');if(d){d.style.display='';d.style.visibility='visible';d.style.opacity='1';}}); await s(2000);
    await pg.locator('[aria-label="预算科目"] input[placeholder="请输入关键字"]').first().fill('13403');
    await pg.locator('[aria-label="预算科目"] button[title="查询"]').first().click(); await s(3000);
    try { await pg.locator('[aria-label="预算科目"] .el-tree-node__content').filter({hasText:'13403'}).first().locator('.el-checkbox__input').first().click({timeout:3000}); } catch(e) {}
    await pg.evaluate(()=>{for(const b of document.querySelectorAll('button')){if(b.textContent.trim()==='确 定'){b.click();return;}}}); await s(2000);
    await pg.evaluate(()=>{document.querySelectorAll('.el-dialog__wrapper').forEach(w=>{w.style.display='none';});}); await s(1000);

    // Query
    console.log('Query...');
    await pg.evaluate(()=>{for(const b of document.querySelectorAll('button')){if(b.textContent.trim()==='查询'){b.click();return;}}}); await s(10000);

    // Expand first 设备设施维护支出 row
    console.log('Expand...');
    await pg.evaluate(()=>{
      document.querySelectorAll('.el-table__expand-icon').forEach(icon => {
        const row = icon.closest('tr');
        if (row && row.textContent.includes('设备设施维护支出') && row.textContent.includes('119')) {
          icon.click();
        }
      });
    }); await s(3000);

    // Extract tree structure with indentation
    const result = await pg.evaluate(()=>{
      const rows = [];
      document.querySelectorAll('.el-table__body-wrapper .el-table__row').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')];
        const firstCell = cells[0];
        // Get indentation from padding-left
        const style = window.getComputedStyle(firstCell);
        const paddingLeft = parseInt(style.paddingLeft) || 0;
        const indentEl = firstCell.querySelector('.el-table__indent');
        const indentWidth = indentEl ? parseInt(window.getComputedStyle(indentEl).width) || 0 : 0;
        const text = (firstCell.textContent||'').trim();
        const org = (cells[1]?.textContent||'').trim();
        const budget = (cells[2]?.textContent||'').trim();
        const used = (cells[3]?.textContent||'').trim();
        rows.push({
          level: indentWidth > 0 ? 1 : 0,
          indent: indentWidth,
          text, org, budget, used
        });
      });
      return rows;
    });

    console.log('\n=== Tree structure ===');
    result.forEach((r,i) => {
      const prefix = r.level > 0 ? '  ├─ ' : '';
      console.log(prefix + r.text + ' | ' + r.org.replace(/.*_/,'') + ' | ' + r.budget + ' | ' + r.used + ' | indent=' + r.indent);
    });

    fs.writeFileSync('E:/workbuddy/Claw/reports/budget_tree.json', JSON.stringify(result,null,2));

  } finally { await safeClose(browser); }
})().catch(e => console.error(e));
