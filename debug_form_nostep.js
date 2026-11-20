// debug_form_nostep.js — 测试只传 TaskID 能否打开表单
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const TASKID = process.argv[2] || '10989601';

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);
    const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${TASKID}&state=running`;
    log('打开: ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    for (const sec of [15, 35, 65]) {
      await wait(sec === 15 ? 15000 : (sec === 35 ? 20000 : 30000));
      const info = await page.evaluate(() => {
        const frames = [...document.querySelectorAll('iframe')].map(f => {
          let d = null; try { d = f.contentDocument; } catch (e) { return { err: 1 }; }
          return { rs: d ? d.readyState : 'n/a', len: d && d.body ? (d.body.innerText || '').length : 0, head: d && d.body ? (d.body.innerText || '').slice(0, 120).replace(/\n/g, '|') : '' };
        });
        return { iframes: frames, bodyLen: (document.body.innerText || '').length };
      });
      log(sec + 's: ' + JSON.stringify(info).slice(0, 500));
    }
    await page.screenshot({ path: 'reports/debug_form_nostep.png' });
  } finally { await b.close().catch(() => {}); }
})();
