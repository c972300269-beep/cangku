const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(15000);

  const task = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const text = await r.text();
    const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
    return (JSON.parse(clean).children || [])[0];
  });

  log(`TaskID=${task.TaskID} StepID=${task.StepID}`);

  // Scan Task.ashx methods
  const taskMethods = ['GetTaskInfo','GetTaskFullInfo','GetTaskFormData','GetFormData','GetProcessInfo',
    'GetProcessByStep','GetProcessByTask','GetProcessInstance','GetProcessInstanceID',
    'GetTaskData','GetForm','GetFormUrl','GetTaskFormUrl','GetTaskUrl',
    'GetStepInfo','GetWorkItem','GetStepData','GetProcessData','GetTaskDetail'];
  
  log('\n=== Task.ashx 方法 ===');
  for (const method of taskMethods) {
    const r = await page.evaluate(async (args) => {
      try {
        const r = await fetch(`/YZSoft.Services.REST/BPM/Task.ashx?method=${args.method}&TaskID=${args.taskID}&_dc=${Date.now()}`, { credentials: 'include' });
        const text = await r.text();
        if (text.length < 10 || text.includes('未知的命令')) return null;
        return { method: args.method, len: text.length, preview: text.substring(0, 300) };
      } catch(e) { return null; }
    }, { method, taskID: task.TaskID });
    if (r) log(`  ✓ ${r.method}: ${r.len}B\n    ${r.preview}`);
  }

  // Try POST submit
  log('\n=== POST CompleteTask ===');
  const post1 = await page.evaluate(async (args) => {
    try {
      const body = `TaskID=${args.taskID}&StepID=${args.stepID}&Action=Approve&comment=同意`;
      const r = await fetch('/YZSoft.Services.REST/BPM/Task.ashx?method=CompleteTask&_dc=' + Date.now(), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
      });
      return { status: r.status, text: await r.text() };
    } catch(e) { return { error: e.message }; }
  }, { taskID: task.TaskID, stepID: task.StepID });
  log(JSON.stringify(post1));

  // Try BPM.ashx
  log('\n=== Modules/BPM.ashx 方法 ===');
  for (const method of ['GetProcessInfo','GetProcessByStep','GetFormUrl','OpenForm','GetTaskForm']) {
    const r = await page.evaluate(async (args) => {
      try {
        const r = await fetch(`/BPM2018/Modules/BPM.ashx?method=${args.method}&TaskID=${args.taskID}&StepID=${args.stepID}&_dc=${Date.now()}`, { credentials: 'include' });
        const text = await r.text();
        if (text.length < 10 || text.includes('未知的命令') || text.includes('参数Method')) return null;
        return { method: args.method, len: text.length, preview: text.substring(0, 300) };
      } catch(e) { return null; }
    }, { method, taskID: task.TaskID, stepID: task.StepID });
    if (r) log(`  ✓ ${r.method}: ${r.len}B\n    ${r.preview}`);
  }

  // Try Process.ashx (if exists)
  log('\n=== Process.ashx 方法 ===');
  for (const method of ['GetProcessInfo','GetProcessByStep','GetFormUrl']) {
    const r = await page.evaluate(async (args) => {
      try {
        const r = await fetch(`/YZSoft.Services.REST/BPM/Process.ashx?method=${args.method}&TaskID=${args.taskID}&_dc=${Date.now()}`, { credentials: 'include' });
        const text = await r.text();
        if (text.length < 10 || text.includes('未知的命令')) return null;
        return { method: args.method, len: text.length, preview: text.substring(0, 300) };
      } catch(e) { return null; }
    }, { method, taskID: task.TaskID });
    if (r) log(`  ✓ ${r.method}: ${r.len}B\n    ${r.preview}`);
  }

  // Try Form.ashx
  log('\n=== Form.ashx 方法 ===');
  for (const method of ['GetForm','GetFormData','LoadForm','Open','Submit','GetTaskForm','GetFormByTask']) {
    const r = await page.evaluate(async (args) => {
      try {
        const body = `TaskID=${args.taskID}&StepID=${args.stepID}`;
        const r = await fetch(`/YZSoft.Services.REST/BPM/Form.ashx?method=${args.method}&_dc=${Date.now()}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
        });
        const text = await r.text();
        if (text.length < 10 || text.includes('未知的命令')) return null;
        return { method: args.method, len: text.length, preview: text.substring(0, 300) };
      } catch(e) { return null; }
    }, { method, taskID: task.TaskID, stepID: task.StepID });
    if (r) log(`  ✓ ${r.method}: ${r.len}B\n    ${r.preview}`);
  }

  await browser.close();
  log('\n完成');
})().catch(e => console.error(e));
