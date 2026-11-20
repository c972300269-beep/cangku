const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox','--auth-server-allowlist=bpm.timesgroup.cn','--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const page = await (await b.newContext({ viewport:{width:1920,height:1080}, ignoreHTTPSErrors:true })).newPage();
  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(12000);

  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({SN:x.SerialNum, StepID:String(x.StepID), TaskID:String(x.TaskID)}));
  });
  const task = tasks[0];
  log('任务: ' + task.SN);

  // 候选方法
  const candidates = [
    // TaskOpt
    'ApproveExt','AgreeExt','PassExt','SubmitExt','CompleteExt','FinishExt',
    'Approve','Agree','Pass','Submit','Complete','Finish',
    // Form
    'Post','Submit','Save','Complete','Execute',
    // Task
    'CompleteTask','FinishTask','DoTask','RunTask','HandleTask','ProcessTask'
  ];

  for (const method of candidates) {
    const endpoints = [];
    if (method.endsWith('Ext') || ['Approve','Agree','Pass','Submit','Complete','Finish'].includes(method)) {
      endpoints.push('/YZSoft.Services.REST/BPM/TaskOpt.ashx?Method=' + method);
    }
    if (!method.endsWith('Ext')) {
      endpoints.push('/YZSoft.Services.REST/BPM/Form.ashx?method=' + method);
      endpoints.push('/YZSoft.Services.REST/BPM/Task.ashx?method=' + method);
    }
    for (const ep of endpoints) {
      const bodies = [
        JSON.stringify({ items: [{ ID: task.StepID, StepID: task.StepID }], comments: '同意' }),
        JSON.stringify({ TaskID: task.TaskID, StepID: task.StepID, Comment: '同意', Result: '同意' }),
        JSON.stringify({ taskid: task.TaskID, stepid: task.StepID, comment: '同意' }),
        'TaskID=' + task.TaskID + '&StepID=' + task.StepID + '&Comment=' + encodeURIComponent('同意')
      ];
      for (const [bi, body] of bodies.entries()) {
        const res = await page.evaluate(async (args) => {
          try {
            const isForm = !args.body.startsWith('{');
            const r = await fetch(args.ep, {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json' },
              body: args.body
            });
            return { status: r.status, text: await r.text() };
          } catch(e) { return { status: 0, text: e.message }; }
        }, { ep, body });
        const text = res.text;
        if (text.includes('success":true')) {
          log(`✅ ${method} ${ep} body${bi}: ${text.substring(0,200)}`);
        } else if (!text.includes('未知的命令') && !text.includes('unknown')) {
          log(`? ${method} ${ep} body${bi}: [${res.status}] ${text.substring(0,120)}`);
        }
        await wait(200);
      }
    }
  }

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
