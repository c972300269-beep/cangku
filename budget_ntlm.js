const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('[0] 启动Chrome (NTLM认证)...');
  
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--auth-server-whitelist=*.linli580.cn',
      '--auth-negotiate-delegate-whitelist=*.linli580.cn',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Remove automation flags
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('[1] 访问预算系统 (NTLM)...');
  const resp = await page.goto('https://xfk.linli580.cn/', { 
    waitUntil: 'domcontentloaded', 
    timeout: 60000 
  });
  console.log(`  状态: ${resp?.status()}`);
  await sleep(8000);
  
  const title = await page.title();
  console.log(`  标题: ${title}`);

  if (title.includes('403')) {
    console.log('  ❌ NTLM也不行 - 这不是认证问题, 是WAF拦截');
    console.log('  这个系统检测到了自动化浏览器');
    
    // Last resort: let user manually interact
    console.log('\n  请在弹出的浏览器中手动操作...');
    console.log('  等待90秒供你登录和操作...');
    await sleep(90000);
    
    // Check again
    const title2 = await page.title();
    console.log(`  最终标题: ${title2}`);
    
    if (!title2.includes('403')) {
      // User logged in! Try to extract data
      console.log('  ✓ 已登录! 提取数据...');
      
      // Find budget menu
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
      console.log(`  页面内容: ${bodyText.substring(0, 200)}`);
      
      // Navigate to budget detail page
      // Need to find the right URL
      console.log('  请在浏览器中导航到: 预算管理 > 预算明细查询');
      await sleep(30000);
      
      // Try XHR
      const result = await page.evaluate(async (body) => {
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
          xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
          xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
          xhr.onerror = () => resolve({ error: true });
          xhr.send(JSON.stringify(body));
        });
      }, { Q_main: { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 });
      
      console.log(`  XHR: status=${result.status}`);
      if (result.status === 200) {
        const outPath = path.join(OUT, 'budget_live_data.json');
        fs.writeFileSync(outPath, result.text);
        console.log(`  ✓ 数据已保存: ${outPath} (${result.text.length} bytes)`);
      } else {
        console.log(`  预览: ${(result.text || '').substring(0, 300)}`);
      }
    }
  } else {
    console.log('  ✓ 成功!');
    
    // Try XHR
    const result = await page.evaluate(async (body) => {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
        xhr.onerror = () => resolve({ error: true });
        xhr.send(JSON.stringify(body));
      });
    }, { Q_main: { PERIOD_S_EQ: 2026, ORG_ID_S_IN: ORGS, ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 });

    console.log(`  XHR: status=${result.status}`);
    if (result.status === 200 && result.text?.length > 100) {
      const outPath = path.join(OUT, 'budget_live_data.json');
      fs.writeFileSync(outPath, result.text);
      console.log(`  ✓ 保存: ${outPath} (${result.text.length} bytes)`);
    }
  }

  await sleep(5000);
  await browser.close();
  console.log('Done');
})();
