// debug_row_open2.js — 在“已审批”列表（GetHistoryTasks 数据）双击行，抓 UI 如何解析 StepID
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
    page.on('request', r => { const u = r.url(); if (/ashx/i.test(u)) reqs.push('MAIN ' + u.slice(0, 250)); });
    ctx.on('page', p => {
      p.on('request', r => { const u = r.url(); if (/Process\.aspx|Form\.ashx/i.test(u)) reqs.push('POPUP ' + u.slice(0, 250)); });
    });

    log('登录...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    // 点左侧组“我发起的流程”，再点子菜单“已审批”
    for (const menu of ['我发起的流程', '已审批']) {
      const ok = await page.evaluate((txt) => {
        const els = [...document.querySelectorAll('a,span,div')];
        const t = els.find(e => (e.innerText || '').trim() === txt && e.offsetHeight > 0);
        if (t) { t.click(); return true; }
        return false;
      }, menu);
      log(`点击「${menu}」=${ok}`);
      await wait(6000);
    }
    reqs.length = 0;

    // 双击第一行
    const rowEl = await page.$('tr:has-text("REQ")');
    if (rowEl) {
      log('双击行: ' + (await rowEl.innerText()).slice(0, 60).replace(/\n/g, '|'));
      await rowEl.dblclick();
    } else { log('无行'); }
    await wait(10000);
    log('--- 请求 ---');
    for (const r of reqs.slice(0, 30)) console.log('  ' + r);
    const pages = ctx.pages().map(p => p.url().slice(0, 180));
    log('所有页面: ' + JSON.stringify(pages, null, 1));
  } finally { await b.close().catch(() => {}); }
})();
