// probe_histtypes.js — 试 GetHistoryTasks 各 HistoryTaskType 是否返回 StepID
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

const TYPES = ['MyRequest', 'MyProcess', 'MyStart', 'MyApply', 'MyInitiate', 'Started', 'Mine', 'Request', 'Start', 'Approve', 'Approval'];
const STATES = ['Running', 'running', ''];

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    for (const t of TYPES) {
      for (const s of STATES) {
        const r = await page.evaluate(async ([type, state]) => {
          const q = `method=GetHistoryTasks&HistoryTaskType=${type}&SpecProcessName=&byYear=1&Year=2026&start=0&limit=50` + (state ? `&ThisTaskState=${state}` : '');
          const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + q + '&_dc=' + Date.now(), { credentials: 'include' });
          return await res.text();
        }, [t, s]);
        let j = null;
        try { j = JSON.parse(r.replace(/new Date\(([^)]+)\)/g, '"date"')); } catch (e) {}
        if (!j || !j.children || !j.children.length) { continue; }
        const c0 = j.children[0];
        const hasStep = c0.StepID !== undefined;
        const hit = j.children.find(x => x.SerialNum === 'REQ20261026259');
        if (hasStep || hit) {
          console.log(`★ ${t}/${s || '(nostate)'} => total=${j.total} rows=${j.children.length} hasStep=${hasStep} 26259=${hit ? 'StepID=' + hit.StepID : '无'}`);
          console.log('   首行字段: ' + Object.keys(c0).join(','));
        }
      }
    }
    console.log('探测完成');
  } finally { await b.close().catch(() => {}); }
})();
