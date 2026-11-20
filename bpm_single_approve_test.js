const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(msg); }

const methods = ['Approve','Agree','Pass','Submit','Complete','Finish','Confirm','Process','Accept'];

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
    return (JSON.parse(c).children||[]).map(x=>({SN:x.SerialNum, StepID:String(x.StepID), TaskID:String(x.TaskID), Desc:x.Description}));
  });
  const task = tasks[0];
  log('测试任务: ' + task.SN + ' StepID=' + task.StepID);

  for (const method of methods) {
    const body = JSON.stringify({ items: [{ ID: task.StepID, StepID: task.StepID }], comments: '同意' });
    const res = await page.evaluate(async (args) => {
      try {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskOpt.ashx?Method=' + args.method, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: args.body
        });
        return { status: r.status, text: await r.text() };
      } catch(e) { return { status: 0, text: e.message }; }
    }, { method, body });
    log(`${method}: [${res.status}] ${res.text.substring(0,200)}`);
    if (res.text.includes('success":true')) {
      log('  ✅ 成功!');
      break;
    }
    await wait(500);
  }

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
