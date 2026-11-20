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
    return (JSON.parse(c).children||[]).map(x=>({SN:x.SerialNum, StepID:String(x.StepID), State:(x.State&&x.State.State)||'running'}));
  });
  const task = tasks[0];
  const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?pid=${task.StepID}&state=${task.State}`;
  log('打开: ' + url);
  await page.goto(url, { waitUntil:'domcontentloaded', timeout:30000 });
  await wait(15000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_process_page.png', fullPage:false });

  const info = await page.evaluate(() => {
    const res = { url: location.href, title: document.title, btns: [], iframes: [] };
    document.querySelectorAll('button, a, span, input, .x-btn, .x-btn-inner, .x-toolbar').forEach(el => {
      const t = (el.textContent || el.value || '').trim();
      if (t && t.length < 40) res.btns.push(t);
    });
    document.querySelectorAll('iframe').forEach(f => res.iframes.push(f.src));
    return res;
  });
  log(JSON.stringify(info, null, 2));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
