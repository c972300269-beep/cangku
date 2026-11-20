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
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID}));
  });

  // Get FULL process info for task 1
  log('=== GetProcessInfo 完整响应 (Task 1) ===');
  const info1 = await page.evaluate(async (args) => {
    const params = new URLSearchParams({
      method: 'GetProcessInfo',
      TaskID: String(args.taskID),
      StepID: String(args.stepID),
      pid: String(args.stepID),
      Permisions: 'RecedeBack,RecedeRestart,Reject,Transfer,Inform,InviteIndicate,Public,Jump,Abort',
      _dc: String(Date.now())
    });
    const r = await fetch('/YZSoft.Services.REST/BPM/Form.ashx?' + params.toString(), { credentials: 'include' });
    return await r.text();
  }, { taskID: tasks[0].TaskID, stepID: tasks[0].StepID });
  log(info1.substring(0, 5000));

  // Now let's try to find the submit/approve API
  // When the portal "同意" button is clicked, it calls something like:
  // POST /YZSoft.Services.REST/BPM/Form.ashx?method=Post
  // Let's try various form submission APIs
  
  log('\n=== 扫描表单操作API ===');
  const actionMethods = [
    'Post', 'Submit', 'Complete', 'Approve', 'ProcessAction',
    'ExecuteAction', 'DoAction', 'HandleAction', 'SaveData',
    'SaveFormData', 'SubmitForm', 'CompleteTask', 'FinishTask'
  ];

  for (const method of actionMethods) {
    const result = await page.evaluate(async (args) => {
      try {
        const body = `TaskID=${args.taskID}&StepID=${args.stepID}&Action=Approve&comment=同意&btnName=同意`;
        const r = await fetch(`/YZSoft.Services.REST/BPM/Form.ashx?method=${args.method}&_dc=${Date.now()}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const text = await r.text();
        if (text.length < 10 || text.includes('未知的命令')) return null;
        return { method: args.method, status: r.status, len: text.length, preview: text.substring(0, 300) };
      } catch(e) { return null; }
    }, { taskID: tasks[0].TaskID, stepID: tasks[0].StepID, method });
    if (result) log(`  ${result.method}: [${result.status}] ${result.preview}`);
  }

  // Also try Task.ashx for completion
  log('\n=== Task.ashx 操作 ===');
  for (const method of ['Post','Submit','CompleteTask','Execute','DoTask']) {
    const result = await page.evaluate(async (args) => {
      try {
        const body = `TaskID=${args.taskID}&StepID=${args.stepID}&Action=Approve&comment=同意`;
        const r = await fetch(`/YZSoft.Services.REST/BPM/Task.ashx?method=${args.method}&_dc=${Date.now()}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
        });
        const text = await r.text();
        if (text.length < 10 || text.includes('未知的命令')) return null;
        return { method: args.method, status: r.status, preview: text.substring(0, 300) };
      } catch(e) { return null; }
    }, { taskID: tasks[0].TaskID, stepID: tasks[0].StepID, method });
    if (result) log(`  ${result.method}: [${result.status}] ${result.preview}`);
  }

  // Look at the form page's JavaScript to find submit handler
  log('\n=== 表单页面脚本 ===');
  await page.goto(`http://bpm.timesgroup.cn/YZSoft/Forms/XForm/邻里类/DHR系统/行政考勤类/邻里-调班申请审批V1.1.aspx?TaskID=${tasks[0].TaskID}&StepID=${tasks[0].StepID}&pid=${tasks[0].StepID}`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await wait(5000);

  // Check for form submit-related JavaScript
  const scripts = await page.evaluate(() => {
    const scriptTags = [...document.querySelectorAll('script')];
    return scriptTags.map(s => ({
      src: (s.src || '').replace(/^.*\//, ''),
      inline: (s.textContent || '').substring(0, 500)
    })).filter(s => s.src || s.inline.length > 0);
  });
  scripts.forEach(s => {
    if (s.inline.includes('submit') || s.inline.includes('同意') || s.inline.includes('approve') || s.inline.includes('PostData') || s.inline.includes('SaveData')) {
      log(`  Script [${s.src}]:\n${s.inline}`);
    }
  });

  // Check for YZSoft form API methods exposed on page
  const apiCheck = await page.evaluate(() => {
    const keys = Object.keys(window).filter(k => 
      k.toLowerCase().includes('submit') || 
      k.toLowerCase().includes('approve') ||
      k.toLowerCase().includes('complete') ||
      k.toLowerCase().includes('post')
    );
    return keys;
  });
  log(`\nWindow API keys: ${apiCheck.join(', ')}`);

  await b.close();
})().catch(e => console.error(e));
