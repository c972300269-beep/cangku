const { chromium } = require('playwright');

const SN = 'REQ20260725900';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();

  await page.goto('http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?pid=136124210', { 
    waitUntil: 'domcontentloaded', timeout: 60000 
  });
  
  console.log('等待表单加载...');
  await new Promise(r => setTimeout(r, 15000));
  
  // Check for 同意 button/text
  let found = await page.evaluate(() => {
    // Look for the agree button in various forms
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const t = (el.textContent || '').trim();
      if (t === '同意' && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'SPAN')) {
        // Find clickable parent
        let target = el;
        while (target && !target.onclick && target.tagName !== 'A' && target.tagName !== 'BUTTON') 
          target = target.parentElement;
        if (target) { target.click(); return 'clicked'; }
        el.click();
        return 'clicked span';
      }
    }
    return 'not found: ' + document.body.innerText.substring(0, 100);
  });
  
  console.log('同意:', found);
  await new Promise(r => setTimeout(r, 5000));
  
  // Check result
  const result = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log('Result:', result);

  // Check if task is gone from worklist
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 10000));
  const check = await page.evaluate(async (sn) => {
    try {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList', { credentials: 'include' });
      const text = await r.text();
      return text.includes(sn) ? 'still pending' : 'APPROVED! Task removed from list.';
    } catch(e) { return 'error: ' + e.message; }
  }, SN);
  
  console.log('\n=== Result ===');
  console.log(check);
  
  await browser.close();
})().catch(e => console.error(e));
