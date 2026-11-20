// debug_row_open.js — 在“已审批/我发起的”列表点行，抓打开表单的真实方式
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
    page.on('request', r => { const u = r.url(); if (/ashx|Process\.aspx|Form/i.test(u)) reqs.push(r.url().slice(0, 220)); });
    ctx.on('page', p => p.on('request', r => { const u = r.url(); if (/ashx|Process\.aspx|Form/i.test(u)) reqs.push('POPUP ' + r.url().slice(0, 220)); }));

    log('登录...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    // 点左侧“我发起的流程”
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('a,span,div')];
      const t = els.find(e => (e.innerText || '').trim() === '我发起的流程' && e.offsetHeight > 0);
      if (t) t.click();
    });
    await wait(6000);

    // 用原生鼠标双击第一行（ExtJS 需要真实事件）
    reqs.length = 0;
    const rowEl = await page.$('tr:has-text("REQ")');
    let rowTxt = null;
    if (rowEl) {
      rowTxt = (await rowEl.innerText()).slice(0, 50).replace(/\n/g, '|');
      await rowEl.dblclick();
      log('已双击行(原生): ' + rowTxt);
    } else {
      log('未找到含REQ的行');
    }
    await wait(9000);
    log('--- 点击后的请求 ---');
    for (const r of reqs.slice(0, 25)) console.log('  ' + r);
    log('当前URL: ' + page.url().slice(0, 180));
    const pages = ctx.pages().map(p => p.url().slice(0, 150));
    log('所有页面: ' + JSON.stringify(pages, null, 1));
    await page.screenshot({ path: 'reports/debug_row_click.png' });
  } finally { await b.close().catch(() => {}); }
})();
