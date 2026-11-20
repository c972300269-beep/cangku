// probe_totalist.js — 验证 GetTotalList 能否拉全“我发起的·运行中”列表（含 StepID）
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs');
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    const variants = [
      'method=GetTotalList',
      'method=GetTotalList&Type=ForwardFlow',
      'method=GetTotalList&Type=ForwardFlow&start=0&limit=500',
      'method=GetTotalList&SpecProcessName=&path=&Type=ForwardFlow&start=0&limit=500',
    ];
    let best = null;
    for (const qs of variants) {
      const r = await page.evaluate(async (q) => {
        const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + q + '&_dc=' + Date.now(), { credentials: 'include' });
        return await res.text();
      }, qs);
      let j = null;
      try { j = JSON.parse(r.replace(/new Date\(([^)]+)\)/g, '"date"')); } catch (e) {}
      const n = j && j.children ? j.children.length : -1;
      const hasStep = j && j.children && j.children[0] && j.children[0].StepID !== undefined;
      const running = j && j.children ? j.children.filter(x => x.State && x.State.State === 'running').length : 0;
      const has26259 = j && j.children && j.children.some(x => x.SerialNum === 'REQ20261026259');
      console.log(`${qs} => total=${j && j.total}, rows=${n}, 首行含StepID=${hasStep}, running行=${running}, 含REQ20261026259=${has26259}`);
      if (n > 0 && hasStep && (!best || n > best.n)) best = { qs, text: r, n };
    }
    if (best) {
      fs.writeFileSync('.workbuddy/bpm_output/totalist_probe.json', best.text.slice(0, 300000));
      console.log('已保存最佳变体到 totalist_probe.json');
    }
  } finally { await b.close().catch(() => {}); }
})();
