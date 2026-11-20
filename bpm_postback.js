const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await b.newContext({
    viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true
  })).newPage();

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);

  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum}));
  });

  const task = tasks[0];
  log(`处理: ${task.SN}`);

  // Get form info
  const info = await page.evaluate(async (args) => {
    const params = new URLSearchParams({
      method: 'GetProcessInfo', TaskID: String(args.taskID),
      StepID: String(args.stepID), pid: String(args.stepID),
      Permisions: 'RecedeBack,RecedeRestart,Reject,Transfer,Inform,InviteIndicate,Public,Jump,Abort',
      _dc: String(Date.now())
    });
    const r = await fetch('/YZSoft.Services.REST/BPM/Form.ashx?' + params.toString(), { credentials: 'include' });
    return await r.json();
  }, { taskID: task.TaskID, stepID: task.StepID });

  const formPath = info.url;
  log(`表单: ${formPath}`);
  log(`动作: ${info.links?.map(l=>l.DisplayString).join(', ')}`);

  // Navigate to form
  await page.goto(`http://bpm.timesgroup.cn${formPath}?TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(5000);

  // Explore form structure
  const formInfo = await page.evaluate(() => {
    // Find all forms
    const forms = [...document.querySelectorAll('form')].map(f => ({
      id: f.id, action: f.action, method: f.method,
      inputs: [...f.querySelectorAll('input')].map(i => ({ name: i.name, value: i.value, type: i.type })).slice(0, 20)
    }));
    
    // Find ASP.NET hidden fields
    const hiddenFields = [...document.querySelectorAll('input[type=hidden]')]
      .map(i => ({ name: i.name, value: (i.value||'').substring(0, 100) }))
      .filter(i => i.name);
    
    // Check for __doPostBack
    const hasDoPostBack = typeof __doPostBack !== 'undefined';
    
    // Find any "同意" link/button that triggers postback
    const agreeElements = [...document.querySelectorAll('a, button, span, input')]
      .filter(el => {
        const t = (el.textContent||el.value||'').trim();
        return t === '同意';
      })
      .map(el => ({
        tag: el.tagName,
        href: el.href || '',
        onclick: (el.onclick?.toString() || el.getAttribute('onclick') || '').substring(0, 200)
      }));
    
    return { forms, hiddenFields, hasDoPostBack, agreeElements };
  });
  log(JSON.stringify(formInfo, null, 2));

  // Try ASP.NET postback submission
  log('\n尝试提交...');

  // Method 1: Try to click the ASP.NET "同意" link
  const clickResult = await page.evaluate(() => {
    // ASP.NET LinkButton: <a onclick="javascript:__doPostBack('xxx','')" href="javascript:__doPostBack('xxx','')">同意</a>
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (link.textContent.trim() === '同意') {
        const onclick = link.getAttribute('onclick') || link.getAttribute('href') || '';
        if (onclick.includes('__doPostBack') || onclick.includes('PostBack')) {
          link.click();
          return { method: 'link click', onclick: onclick.substring(0, 200) };
        }
      }
    }
    return null;
  });
  log(`点击: ${JSON.stringify(clickResult)}`);
  await wait(5000);

  if (!clickResult) {
    // Method 2: Direct __doPostBack call
    const postbackResult = await page.evaluate(() => {
      if (typeof __doPostBack === 'function') {
        // Find the event target for "同意"
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent.trim() === '同意') {
            const href = link.getAttribute('href') || '';
            const match = href.match(/__doPostBack\('([^']+)'/);
            if (match) {
              __doPostBack(match[1], '');
              return { method: '__doPostBack', target: match[1] };
            }
          }
        }
      }
      return null;
    });
    log(`PostBack: ${JSON.stringify(postbackResult)}`);
    await wait(5000);
  }

  // Check if there's a postback response  
  const resultText = await page.evaluate(() => {
    const body = document.body.innerText || '';
    return body.substring(0, 500);
  });
  log(`结果: ${resultText}`);

  // Verify
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(8000);
  const gone = await page.evaluate(async (sn) => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    return !r.text().includes(sn);
  }, task.SN);
  log(gone ? '✅ 成功！' : '⚠️ 仍在待办');

  await b.close();
})().catch(e => console.error(e));
