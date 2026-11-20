const { chromium } = require('playwright');

const BPM_URL = 'http://bpm.timesgroup.cn';
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
  await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(15000);

  // Get task with StepID
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const text = await r.text();
    const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
    return (JSON.parse(clean).children || []);
  });

  const task = tasks[0];
  log(`TaskID=${task.TaskID} StepID=${task.StepID}`);

  // Try ALL Task.ashx methods
  const methods = [
    'GetTaskInfo', 'GetTaskFullInfo', 'GetTaskFormData', 'GetFormData',
    'GetProcessInfo', 'GetProcessByStep', 'GetProcessByTask',
    'GetProcessInstance', 'GetProcessInstanceID', 'GetProcessID',
    'GetTaskData', 'GetForm', 'GetFormUrl', 'GetTaskFormUrl',
    'GetTaskUrl', 'OpenTask', 'GetTaskForm', 'GetStepInfo',
    'GetWorkItem', 'GetWorkItemInfo', 'GetStepData', 'GetProcessData',
    'GetTaskDetail', 'GetDetail', 'GetDetails', 'GetData',
    'Get', 'Load', 'Query', 'Read', 'View'
  ];

  log('\n=== 扫描 Task.ashx 方法 ===');
  for (const method of methods) {
    const result = await page.evaluate(async (taskID, method) => {
      try {
        const r = await fetch(`/YZSoft.Services.REST/BPM/Task.ashx?method=${method}&TaskID=${taskID}&_dc=${Date.now()}`, { credentials: 'include' });
        const text = await r.text();
        if (text.length < 10) return null;
        if (text.includes('未知的命令')) return null;
        return { method, len: text.length, ok: !text.includes('success":false'), preview: text.substring(0, 200) };
      } catch(e) { return null; }
    }, task.TaskID, method);
    if (result) log(`  ✓ ${result.method}: len=${result.len} ok=${result.ok}\n    ${result.preview}`);
  }

  // Also try POST with form data
  log('\n=== 尝试 POST Task.ashx (带StepID) ===');
  const postResult = await page.evaluate(async (taskID, stepID) => {
    const body = `TaskID=${taskID}&StepID=${stepID}&Action=Approve&comment=同意`;
    const r = await fetch('/YZSoft.Services.REST/BPM/Task.ashx?method=CompleteTask&_dc=' + Date.now(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    return { status: r.status, text: await r.text() };
  }, task.TaskID, task.StepID);
  log(`POST CompleteTask: ${JSON.stringify(postResult)}`);

  // Try BPM.ashx module API
  log('\n=== 扫描 Modules/BPM.ashx 方法 ===');
  for (const method of ['GetProcessInfo', 'GetProcessByStep', 'GetFormUrl', 'GetTaskUrl', 'OpenForm', 'GetTaskForm']) {
    const result = await page.evaluate(async (taskID, stepID, method) => {
      try {
        const r = await fetch(`/BPM2018/Modules/BPM.ashx?method=${method}&TaskID=${taskID}&StepID=${stepID}&_dc=${Date.now()}`, { credentials: 'include' });
        const text = await r.text();
        if (text.length < 10) return null;
        if (text.includes('未知的命令') || text.includes('参数Method')) return null;
        return { method, len: text.length, preview: text.substring(0, 200) };
      } catch(e) { return null; }
    }, task.TaskID, task.StepID, method);
    if (result) log(`  ✓ ${result.method}: len=${result.len}\n    ${result.preview}`);
  }

  // Try Process.ashx
  log('\n=== 扫描 Process.ashx 方法 ===');
  for (const method of ['GetProcessInfo', 'GetProcessByStep', 'GetStepInfo', 'GetFormUrl', 'GetTaskInfo']) {
    const result = await page.evaluate(async (taskID, stepID, method) => {
      try {
        const r = await fetch(`/YZSoft.Services.REST/BPM/Process.ashx?method=${method}&TaskID=${taskID}&StepID=${stepID}&_dc=${Date.now()}`, { credentials: 'include' });
        const text = await r.text();
        if (text.length < 10) return null;
        if (text.includes('未知的命令')) return null;
        return { method, len: text.length, preview: text.substring(0, 200) };
      } catch(e) { return null; }
    }, task.TaskID, task.StepID, method);
    if (result) log(`  ✓ ${result.method}: len=${result.len}\n    ${result.preview}`);
  }

  await browser.close();
  log('\n完成');
})().catch(e => console.error(e));
