// debug_form_dump.js — 调试：打开一条审批中流程的表单，转储页面结构
const { chromium } = require('playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const TASK = { sn: 'REQ20261052119', taskID: '10970415', stepID: '', state: 'running' };

(async () => {
  const b = await chromium.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    log('登录 BPM...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    // 先拉运行列表，拿这条单真实的 TaskID/StepID/State
    const item = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetHistoryTasks&HistoryTaskType=MyRequest&SpecProcessName=&byYear=1&Year=2026&ThisTaskState=Running&page=1&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const j = JSON.parse((await r.text()).replace(/new Date\(([^)]+)\)/g, '"date"'));
      const x = (j.children || []).find(c => c.SerialNum === sn);
      if (!x) return null;
      return { TaskID: x.TaskID, StepID: x.StepID, State: x.State ? x.State.State : '?', raw: JSON.stringify(x).slice(0, 500) };
    }, TASK.sn);
    log('运行列表记录: ' + JSON.stringify(item));
    if (!item) { log('未找到该单'); await b.close(); return; }

    const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${item.TaskID}&StepID=${item.StepID}&pid=${item.StepID}&state=${item.State}`;
    log('打开: ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

    for (const sec of [10, 20, 40, 70]) {
      await wait(sec === 10 ? 10000 : (sec === 20 ? 10000 : (sec === 40 ? 20000 : 30000)));
      const info = await page.evaluate(() => {
        const frames = [...document.querySelectorAll('iframe')].map(f => {
          let d = null; try { d = f.contentDocument; } catch (e) { return { err: String(e).slice(0, 50) }; }
          return { rs: d ? d.readyState : 'n/a', len: d && d.body ? (d.body.innerText || '').length : 0,
                   head: d && d.body ? (d.body.innerText || '').slice(0, 150).replace(/\n/g, '|') : '' };
        });
        return { url: location.href.slice(0, 120), title: document.title, bodyLen: (document.body.innerText || '').length,
                 bodyHead: (document.body.innerText || '').slice(0, 300).replace(/\n+/g, '|'), iframes: frames };
      });
      log(`--- ${sec}s ---`);
      console.log(JSON.stringify(info, null, 1).slice(0, 1200));
      await page.screenshot({ path: `reports/debug_form_${sec}.png` });
    }
  } finally { await b.close().catch(() => {}); }
})();
