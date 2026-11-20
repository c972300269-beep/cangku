// debug_read_dump.js — 转储 Read.aspx 页面结构（iframe 深度遍历）
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const TID = process.argv[2] || '10989601'; // REQ20261052119

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);
    const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Read.aspx?tid=${TID}&state=running`;
    log('打开: ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

    for (const sec of [15, 40, 80]) {
      await wait(sec === 15 ? 15000 : (sec === 40 ? 25000 : 40000));
      // 用 Playwright frames API 而非手写递归
      const frames = page.frames().map(f => ({
        url: f.url().slice(0, 110),
        name: f.name() || '(main)'
      }));
      const texts = [];
      for (const f of page.frames()) {
        try {
          const t = await f.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
          if (t && t.length > 30) texts.push({ frame: f.url().slice(0, 80), len: t.length, head: t.slice(0, 300).replace(/\s+/g, ' ') });
        } catch (e) {}
      }
      log(`--- ${sec}s: ${frames.length} frames ---`);
      for (const f of frames) console.log('  frame: ' + f.url);
      for (const t of texts) console.log(`  TEXT[${t.len}](${t.frame}): ${t.head.slice(0, 250)}`);
      await page.screenshot({ path: `reports/debug_read_${sec}.png` });
    }
  } finally { await b.close().catch(() => {}); }
})();
