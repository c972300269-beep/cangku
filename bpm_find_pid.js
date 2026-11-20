const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await b.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  })).newPage();

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(15000);

  // Get tasks
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]);
  });
  const task = tasks[0];
  log(`TaskID=${task.TaskID} StepID=${task.StepID} SN=${task.SerialNum}`);

  // Try to find ProcessInstanceID via various APIs
  log('\n=== 查找 pid ===');

  // Try ALL methods on Process.ashx, Task.ashx, BPM.ashx, Form.ashx with StepID
  const endpoints = [
    { url: '/YZSoft.Services.REST/BPM/Process.ashx', methods: ['GetProcessByStep','GetProcess','GetProcessInfo','GetByStep','GetStepInfo','GetProcessID','GetInstanceID'] },
    { url: '/YZSoft.Services.REST/BPM/Task.ashx', methods: ['GetTaskAllInfo','GetTaskFullData','GetTaskDetail','GetProcessInstance','GetProcessInstanceID','GetPID'] },
    { url: '/YZSoft.Services.REST/BPM/Form.ashx', methods: ['GetProcessID','GetPID','GetProcessInstance','GetTaskProcess'] },
    { url: '/BPM2018/Modules/BPM.ashx', methods: ['GetProcessByStep','GetProcessInfo','GetProcessID','GetTaskProcess'] },
    { url: '/BPM2018/Workflow/Workflow.ashx', methods: ['GetProcessID','GetPID','GetProcess','GetByStep'] },
  ];

  for (const ep of endpoints) {
    for (const method of ep.methods) {
      const result = await page.evaluate(async (args) => {
        try {
          const params = new URLSearchParams({
            method: args.method,
            TaskID: String(args.taskID),
            StepID: String(args.stepID),
            _dc: String(Date.now())
          });
          const r = await fetch(args.url + '?' + params.toString(), { credentials: 'include' });
          const text = await r.text();
          if (text.length < 10 || text.includes('未知的命令') || text.includes('参数Method')) return null;
          return { url: args.url.split('/').pop(), method: args.method, len: text.length, 
                   preview: text.substring(0, 300), success: text.includes('"success":true') };
        } catch(e) { return null; }
      }, { url: ep.url, method, taskID: task.TaskID, stepID: task.StepID });
      if (result && result.success) {
        log(`✅ ${result.url}?method=${result.method}`);
        log(`   ${result.preview}`);
      }
    }
  }

  // Also try getting pid from the ExtJS model itself
  log('\n=== ExtJS 数据模型中的 pid ===');
  const extPID = await page.evaluate((stepID) => {
    try {
      // Check if we can access it through ExtJS stores
      const grids = Ext.ComponentQuery.query('grid');
      for (const g of grids) {
        if (!g.store || !g.store.getCount) continue;
        for (let i = 0; i < g.store.getCount(); i++) {
          const rec = g.store.getAt(i);
          if (rec.get('StepID') === stepID) {
            // Dump ALL fields
            const fields = rec.fields ? rec.fields.items.map(f=>f.name) : Object.keys(rec.data);
            const data = {};
            fields.forEach(f => { data[f] = rec.get(f); });
            return { fields, data };
          }
        }
      }
    } catch(e) { return { error: e.message }; }
    return { error: 'not found' };
  }, task.StepID);
  log(JSON.stringify(extPID, null, 2));

  // Try the worklist data - it might have pid in a different field
  log('\n=== WorkList 原始数据 ===');
  const rawData = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    return await r.text();
  });

  // Search for pid/ProcessID/InstanceID in raw data
  const pidPatterns = ['pid', 'PID', 'ProcessID', 'ProcessInstanceID', 'InstanceID', 'processId', 'processInstanceId'];
  for (const p of pidPatterns) {
    const idx = rawData.indexOf('"' + p + '"');
    if (idx > 0) {
      log(`  找到 "${p}" at position ${idx}: ${rawData.substring(idx, idx + 100)}`);
    }
  }

  // Check if PID is numeric and embedded in StepID or some other field
  log(`\nStepID: ${task.StepID}, TaskID: ${task.TaskID}`);
  log(`可能: StepID高位=${Math.floor(task.StepID / 1000)}, 低位=${task.StepID % 1000}`);

  // Try StepID as pid in GetProcessInfo
  log('\n=== 用 StepID 的变体作为 pid ===');
  const pidAttempts = [
    task.StepID,
    task.TaskID,
    Math.floor(task.StepID / 1000),
    Math.floor(task.TaskID / 1000),
    task.StepID - task.TaskID,
    task.TaskID - task.StepID,
  ];
  
  for (const pid of pidAttempts) {
    const result = await page.evaluate(async (args) => {
      const params = new URLSearchParams({
        method: 'GetProcessInfo',
        TaskID: String(args.taskID),
        StepID: String(args.stepID),
        pid: String(args.pid),
        Permisions: 'RecedeBack,RecedeRestart,Reject,Transfer,Inform,InviteIndicate,Public,Jump,Abort',
        _dc: String(Date.now())
      });
      const r = await fetch('/YZSoft.Services.REST/BPM/Form.ashx?' + params.toString(), { credentials: 'include' });
      const text = await r.text();
      return { pid: args.pid, success: !text.includes('success":false'), preview: text.substring(0, 200) };
    }, { taskID: task.TaskID, stepID: task.StepID, pid });
    
    if (result.success) {
      log(`  ✅ pid=${result.pid}: ${result.preview}`);
    } else {
      log(`  ✗ pid=${result.pid}`);
    }
  }

  await b.close();
})().catch(e => console.error(e));
