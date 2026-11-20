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
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum,Desc:x.Description}));
  });
  log('待办: ' + tasks.length);
  const task = tasks[0];
  log('探测: ' + task.SN + ' TaskID=' + task.TaskID + ' StepID=' + task.StepID);

  // 拦截网络请求，捕获提交API
  const requests = [];
  page.on('request', req => {
    const u = req.url();
    if (/Task\.ashx|Form\.ashx|Workflow|Complete|Submit|Approve/i.test(u)) {
      requests.push({ url:u, method:req.method(), post: req.postData() });
    }
  });
  page.on('response', resp => {
    const u = resp.url();
    if (/Task\.ashx|Form\.ashx|Workflow|Complete|Submit|Approve/i.test(u)) {
      requests.push({ respUrl:u, status: resp.status() });
    }
  });

  const info = await page.evaluate(async (args) => {
    const p = new URLSearchParams({ method:'GetProcessInfo', TaskID:String(args.taskID), StepID:String(args.stepID), pid:String(args.stepID), Permisions:'RecedeBack,RecedeRestart,Reject,Transfer,Inform,InviteIndicate,Public,Jump,Abort', _dc:String(Date.now()) });
    const r = await fetch('/YZSoft.Services.REST/BPM/Form.ashx?'+p.toString(),{credentials:'include'});
    return await r.text();
  }, { taskID: task.TaskID, stepID: task.StepID });
  log('Form.ashx 返回前300: ' + info.substring(0,300));

  let url = '';
  try { const j = JSON.parse(info); url = j.url || ''; } catch(e){}
  if (url.startsWith('/')) url = 'http://bpm.timesgroup.cn' + url;
  url += (url.includes('?')?'&':'?') + `TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}`;
  log('打开表单: ' + url);
  await page.goto(url, { waitUntil:'domcontentloaded', timeout:30000 });

  // 等待ExtJS渲染
  for (let i=0;i<10;i++){
    await wait(3000);
    const dump = await page.evaluate(() => {
      const res = { btns: [], iframes: [] };
      // 主页面所有按钮文本
      const els = document.querySelectorAll('button, a, span, input[type=button], input[type=submit], .x-btn, .x-btn-inner');
      els.forEach(el => {
        const t = (el.textContent || el.value || '').trim();
        if (t && t.length < 30 && el.offsetParent !== null) res.btns.push(t);
      });
      // iframe
      document.querySelectorAll('iframe').forEach(f => {
        try {
          const doc = f.contentDocument || f.contentWindow.document;
          doc.querySelectorAll('button, a, span, input, .x-btn, .x-btn-inner').forEach(el => {
            const t = (el.textContent || el.value || '').trim();
            if (t && t.length < 30 && el.offsetParent !== null) res.iframes.push(t);
          });
        } catch(e){}
      });
      return res;
    });
    log(`[${i+1}] 主按钮: ${[...new Set(dump.btns)].join(' | ')}`);
    if (dump.iframes.length) log(`[${i+1}] iframe按钮: ${[...new Set(dump.iframes)].join(' | ')}`);
    if ([...new Set(dump.btns)].some(t=>/同意|提交|通过|完成|确认/.test(t))) { log('找到审批按钮，停止等待'); break; }
  }

  log('\n=== 捕获的审批相关请求 ===');
  requests.forEach(r => log(JSON.stringify(r).substring(0,400)));

  await b.close();
  log('探测完成');
})().catch(e=>{ console.error(e); process.exit(1); });
