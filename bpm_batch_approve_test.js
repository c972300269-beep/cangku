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

  // 获取待办
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({SN:x.SerialNum, StepID:String(x.StepID), TaskID:String(x.TaskID), Desc:x.Description}));
  });
  log('待办: ' + tasks.length);
  tasks.forEach(t => log(`  ${t.SN} StepID=${t.StepID}`));

  // 批量同意
  const items = tasks.map(t => ({ ID: t.StepID, StepID: t.StepID }));
  log('\n调用 BatchApprove...');
  const result = await page.evaluate(async (items) => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskOpt.ashx?Method=BatchApprove', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    return { status: r.status, text: await r.text() };
  }, items);
  log('状态: ' + result.status);
  log('返回: ' + result.text);

  // 验证
  await wait(3000);
  const remaining = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>x.SerialNum);
  });
  log('\n剩余待办: ' + remaining.length);
  remaining.forEach(sn => log('  ' + sn));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
