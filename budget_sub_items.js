const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
const OUT = 'E:/workbuddy/Claw/reports';

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(()=>{}); } catch {}
  try { const p=browser.process?browser.process():null; if(p&&p.pid) process.kill(p.pid,'SIGKILL'); } catch {}
}

(async () => {
  let browser = null;
  try {
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--mute-audio','--js-flags=--max-old-space-size=512']
  });
  const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, locale:'zh-CN', ignoreHTTPSErrors:true, userAgent:'Mozilla/5.0 Chrome/131.0.0.0' });
  const page = await ctx.newPage();
  await page.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>false});});

  console.log('[1] 登录...');
  await page.goto('https://xfk.linli580.cn/eacp/user/login',{waitUntil:'domcontentloaded',timeout:30000}); await sleep(4000);
  await page.locator('input[placeholder="请输入帐户名或邮箱地址"]').fill('chenjialin3');
  await page.locator('input[placeholder="请输入密码"]').fill('chenjialin');
  await page.locator('button:has-text("登录")').first().click({timeout:5000}); await sleep(5000);

  console.log('[2] 预算明细...');
  await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail',{waitUntil:'domcontentloaded',timeout:60000}); await sleep(8000);

  // Year - copy from working script
  console.log('[3] 年份...');
  await page.locator('.h-pro-form-item--year input.el-input__inner').first().click({timeout:5000}).catch(()=>{}); await sleep(1000);
  for(let i=0;i<await page.locator('.el-year-table td .cell').count();i++){
    if((await page.locator('.el-year-table td .cell').nth(i).textContent()).trim()==='2026'){
      await page.locator('.el-year-table td .cell').nth(i).click(); break;
    }
  } await sleep(1000);

  // Orgs - copy from working script
  console.log('[4] 组织...');
  await page.locator('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search').first().click({timeout:5000}).catch(()=>{}); await sleep(4000);
  await page.evaluate(()=>{const d=document.querySelector('[aria-label="预算组织（个人）"]');if(d){d.style.display='';d.style.visibility='visible';d.style.opacity='1';}}); await sleep(2000);
  for(const org of ORGS){
    try{await page.locator('[aria-label="预算组织（个人）"] .el-tree-node__content').filter({hasText:org}).first().locator('.el-checkbox__input').first().click({timeout:3000});}catch(e){}
    await sleep(300);
  }
  await page.evaluate(()=>{for(const b of document.querySelectorAll('button')){if(b.textContent.trim()==='确 定'){b.click();return;}}}); await sleep(2000);
  await page.keyboard.press('Escape'); await sleep(1000);

  // Subject - copy from working script
  console.log('[5] 科目13403...');
  await page.locator('.h-pro-form-item--budgetSubject\\.id .ref-icon.el-icon-search, [title="预算科目"] .ref-icon.el-icon-search').first().click({timeout:5000}).catch(()=>{}); await sleep(4000);
  await page.evaluate(()=>{const d=document.querySelector('[aria-label="预算科目"]');if(d){d.style.display='';d.style.visibility='visible';d.style.opacity='1';}}); await sleep(2000);
  await page.locator('[aria-label="预算科目"] input[placeholder="请输入关键字"]').first().fill('13403');
  await page.locator('[aria-label="预算科目"] button[title="查询"]').first().click(); await sleep(3000);
  try{await page.locator('[aria-label="预算科目"] .el-tree-node__content').filter({hasText:'13403'}).first().locator('.el-checkbox__input').first().click({timeout:3000});}catch(e){}
  await page.evaluate(()=>{for(const b of document.querySelectorAll('button')){if(b.textContent.trim()==='确 定'){b.click();return;}}}); await sleep(2000);
  await page.evaluate(()=>{document.querySelectorAll('.el-dialog__wrapper').forEach(w=>{w.style.display='none';});}); await sleep(1000);

  // Query - copy from working script
  console.log('[6] 查询...');
  await page.evaluate(()=>{for(const b of document.querySelectorAll('button')){if(b.textContent.trim()==='查询'||b.textContent.trim()==='查 询'){b.click();return;}}}); await sleep(10000);

  // NEW: Expand rows and get tree structure
  console.log('[7] 提取子目录结构...');
  
  // Get rows BEFORE expansion
  const beforeCount = await page.evaluate(()=>document.querySelectorAll('.el-table__body-wrapper .el-table__row').length);
  console.log('  展开前行数:', beforeCount);

  // Click ALL expand icons (the page already only shows 13403 rows)
  await page.evaluate(()=>{
    document.querySelectorAll('.el-table__expand-icon').forEach(icon=>{
      try{icon.click();}catch(e){}
    });
  }); await sleep(4000);
  
  const afterCount = await page.evaluate(()=>document.querySelectorAll('.el-table__body-wrapper .el-table__row').length);
  console.log('  展开后行数:', afterCount);
  
  // Extract with indentation
  const treeData = await page.evaluate(()=>{
    const rows = [];
    document.querySelectorAll('.el-table__body-wrapper .el-table__row').forEach(tr=>{
      const cells = [...tr.querySelectorAll('td')];
      const firstTd = cells[0];
      const indent = parseInt(window.getComputedStyle(firstTd).paddingLeft) || 0;
      const text = (firstTd.textContent||'').trim();
      const org = (cells[1]?.textContent||'').trim().replace(/.*_/,'');
      const budget = (cells[2]?.textContent||'').trim();
      const used = (cells[3]?.textContent||'').trim();
      const remain = (cells[4]?.textContent||'').trim();
      rows.push({indent, text, org, budget, used, remain});
    });
    return rows;
  });

  // Print tree
  console.log('\n=== 13403 设备设施维护支出 - 子目录展开 ===\n');
  let prevIndent = 0;
  treeData.forEach(r => {
    const isChild = r.indent > 20;
    const prefix = isChild ? '  ├─ ' : '';
    console.log(prefix + r.text + ' | ' + r.org + ' | 预算=' + r.budget + ' | 已用=' + r.used + ' | 剩余=' + r.remain);
  });

  // Also show text summary grouped by org
  const byOrg = {};
  treeData.forEach(r => {
    const org = r.org;
    const isChild = r.indent > 20;
    if (!byOrg[org]) byOrg[org] = {parent:null, children:[]};
    if (!isChild) byOrg[org].parent = r;
    else byOrg[org].children.push(r);
  });

  console.log('\n=== 按组织汇总 ===');
  for (const [org, data] of Object.entries(byOrg)) {
    console.log('\n【' + org + '】');
    if (data.parent) {
      console.log('  总计: 预算=' + data.parent.budget + ' | 已用=' + data.parent.used + ' | 剩余=' + data.parent.remain);
    }
    console.log('  子目录(' + data.children.length + '个):');
    data.children.forEach(c => {
      console.log('    ' + c.text + ': 预算=' + c.budget + ' 已用=' + c.used + ' 剩余=' + c.remain);
    });
  }

  } finally {
    await safeClose(browser);
  }
})().catch(e => console.error(e));
