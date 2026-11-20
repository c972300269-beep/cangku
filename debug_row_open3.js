// debug_row_open3.js — 只点可见行，抓 UI 打开表单前的解析调用
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const reqs = [];
    page.on('request', r => { const u = r.url(); if (/\.ashx|Process\.aspx/i.test(u)) reqs.push('MAIN ' + u.slice(0, 250)); });
    ctx.on('page', p => {
      p.on('request', r => { const u = r.url(); if (/Process\.aspx|Form\.ashx|\.ashx/i.test(u)) reqs.push('POPUP ' + u.slice(0, 250)); });
    });

    log('登录...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    for (const menu of ['我发起的流程', '已审批']) {
      await page.evaluate((txt) => {
        const els = [...document.querySelectorAll('a,span,div')];
        const t = els.find(e => (e.innerText || '').trim() === txt && e.offsetHeight > 0);
        if (t) t.click();
      }, menu);
      await wait(6000);
    }
    reqs.length = 0;

    // 找可见的含REQ行
    const handles = await page.$$('tr');
    let target = null;
    for (const h of handles) {
      const txt = await h.innerText().catch(() => '');
      if (/REQ\d+/.test(txt)) {
        const box = await h.boundingBox().catch(() => null);
        if (box && box.width > 100 && box.height > 5) { target = h; log(`候选行: ${txt.slice(0, 60).replace(/\n/g, '|')} box=${JSON.stringify(box)}`); break; }
      }
    }
    if (!target) { log('未找到可见行'); }
    else {
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.dblclick({ timeout: 15000 }).catch(e => log('双击异常: ' + e.message.slice(0, 80)));
      await wait(10000);
    }
    log('--- 请求 ---');
    for (const r of reqs.slice(0, 30)) console.log('  ' + r);
    const pages = ctx.pages().map(p => p.url().slice(0, 180));
    log('所有页面: ' + JSON.stringify(pages, null, 1));
    await page.screenshot({ path: 'reports/debug_row3.png' });
  } finally { await b.close().catch(() => {}); }
})();
