// probe_stepid.js — 探测哪个接口能按 TaskID 返回 StepID
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const TID = '10989601'; // REQ20261052119

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    const tries = [
      ['TaskList', 'GetTaskInfo', `TaskID=${TID}`],
      ['TaskList', 'GetTaskInfo', `taskID=${TID}`],
      ['TaskList', 'GetTaskHistory', `TaskID=${TID}`],
      ['TaskList', 'GetTaskTrace', `TaskID=${TID}`],
      ['TaskList', 'GetTaskSteps', `TaskID=${TID}`],
      ['TaskList', 'GetTaskProcessInfo', `TaskID=${TID}`],
      ['TaskList', 'GetProcessTrace', `TaskID=${TID}`],
      ['TaskList', 'GetApprovalTrace', `TaskID=${TID}`],
      ['TaskList', 'GetMyProcess', `TaskID=${TID}`],
      ['TaskList', 'GetTask', `TaskID=${TID}`],
      ['TaskList', 'GetHistory', `TaskID=${TID}`],
      ['Process', 'GetProcessInstance', `TaskID=${TID}`],
      ['Process', 'GetProcessInfo', `TaskID=${TID}`],
      ['Process', 'GetProcessStatus', `TaskID=${TID}`],
      ['Task', 'GetTaskInfo', `TaskID=${TID}`],
      ['Task', 'GetTrace', `TaskID=${TID}`],
      ['Task', 'GetProcessSteps', `TaskID=${TID}`],
    ];
    for (const [ashx, method, qs] of tries) {
      const r = await page.evaluate(async ([a, m, q]) => {
        const res = await fetch(`/YZSoft.Services.REST/BPM/${a}.ashx?method=${m}&${q}&_dc=` + Date.now(), { credentials: 'include' });
        const t = await res.text();
        return t.slice(0, 350);
      }, [ashx, method, qs]);
      const has = /step/i.test(r) && /success"\s*:\s*true/.test(r);
      console.log(`${(has ? '★ ' : '  ')}${ashx}.${method}?${qs} => ${r.slice(0, 200).replace(/\s+/g, ' ')}`);
    }
  } finally { await b.close().catch(() => {}); }
})();
