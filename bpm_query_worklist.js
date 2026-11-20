const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(() => {}); } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

(async () => {
  let b;
  try {
    b = await chromium.launch({
      headless: true,
      executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
      args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
    });
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(12000);

    const tasks = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
      const t = await r.text();
      const c = t.replace(/new Date\(([^)]+)\)/g, '"date"');
      const j = JSON.parse(c);
      const list = j.children || [];
      return list.map(x => ({
        SN: x.SerialNum,
        StepID: String(x.StepID),
        TaskID: String(x.TaskID),
        Desc: x.Description,
        Owner: x.OwnerDisplayName,
        State: (x.State && x.State.State) || 'running',
        Title: x.TaskTitle || x.ProcessName || ''
      }));
    });

    require('fs').writeFileSync(
      'E:\\workbuddy\\Claw\\.workbuddy\\bpm_output\\worklist.json',
      JSON.stringify({ count: tasks.length, time: new Date().toISOString(), tasks }, null, 2),
      'utf8'
    );
    console.log('WROTE worklist.json, count=' + tasks.length);
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await safeClose(b);
  }
})();
