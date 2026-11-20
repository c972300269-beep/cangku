// debug_mystart_ui.js — 真实逛 BPM UI，抓“我发起的”入口与 StepID 来源
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    // 监听所有带 StepID 的请求
    const stepHits = [];
    page.on('request', r => { const u = r.url(); if (/stepid/i.test(u)) stepHits.push(u.slice(0, 200)); });
    page.on('response', async r => {
      const u = r.url();
      if (/\.ashx/i.test(u) && /Task|Process|History/i.test(u)) {
        try {
          const t = await r.text();
          if (/StepID/i.test(t)) stepHits.push('RESP ' + u.slice(0, 150) + ' => ' + t.slice(t.toLowerCase().indexOf('stepid') - 60, t.toLowerCase().indexOf('stepid') + 120).replace(/\s+/g, ' '));
        } catch (e) {}
      }
    });

    log('登录...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);
    log('首页URL: ' + page.url());

    // 抓首页所有链接
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => ({ t: (a.innerText || '').trim().slice(0, 20), h: (a.href || '').slice(0, 120) })).filter(x => x.t));
    console.log('--- 首页链接 ---');
    for (const l of links) console.log(`  ${l.t} -> ${l.h}`);

    // 找“我发起/我的请求/发起”相关入口
    const cand = links.find(l => /我发起|我的请求|MyRequest|发起/.test(l.t)) || links.find(l => /MyRequest|MyStart/i.test(l.h));
    if (cand) {
      log('进入入口: ' + cand.t + ' ' + cand.h);
      await page.goto(cand.h, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(e => log('goto异常 ' + e.message.slice(0, 60)));
      await wait(10000);
      log('当前URL: ' + page.url().slice(0, 150));
      await page.screenshot({ path: 'reports/debug_mystart.png' });
      // 打印页面上的行与链接
      const rows = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => ({ t: (a.innerText || '').trim().slice(0, 40), h: (a.href || '').slice(0, 160) })).filter(x => /REQ|Process|Task/i.test(x.h + x.t)).slice(0, 30));
      console.log('--- 列表行链接 ---');
      for (const r of rows) console.log(`  ${r.t} -> ${r.h}`);
      await wait(5000);
    } else {
      log('未找到“我发起的”入口链接，截图人工看');
      await page.screenshot({ path: 'reports/debug_home.png' });
    }
    console.log('--- StepID 相关请求 ---');
    for (const s of stepHits.slice(0, 20)) console.log('  ' + s);
  } finally { await b.close().catch(() => {}); }
})();
