// probe_type.js — 暴力试 GetTotalList 的 Type 值，找“我发起的·运行中”列表
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

const TYPES = ['ForwardFlow', 'Inform', 'InformFlow', 'Start', 'StartFlow', 'MyStart', 'Forward', 'History',
  'Completed', 'Running', 'All', 'MyRequest', 'StartedList', 'CC', 'InformMe', 'WatchFlow', 'MonitorFlow'];

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    for (const t of TYPES) {
      const r = await page.evaluate(async (type) => {
        const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetTotalList&SpecProcessName=&path=&Type=' + type + '&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
        return await res.text();
      }, t);
      let j = null;
      try { j = JSON.parse(r.replace(/new Date\(([^)]+)\)/g, '"date"')); } catch (e) {}
      if (!j || !j.children || !j.children.length) { console.log(`${t} => 空/非列表: ${r.slice(0, 80).replace(/\s+/g, ' ')}`); continue; }
      const n = j.children.length;
      const hasStep = j.children[0].StepID !== undefined;
      const hit = j.children.find(x => x.SerialNum === 'REQ20261026259');
      const running = j.children.filter(x => x.State && x.State.State === 'running').length;
      console.log(`★ ${t} => total=${j.total} rows=${n} hasStep=${hasStep} running=${running} 26259=${hit ? '有(StepID=' + hit.StepID + ')' : '无'}`);
    }
  } finally { await b.close().catch(() => {}); }
})();
