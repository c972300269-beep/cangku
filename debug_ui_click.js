// debug_ui_click.js — 逐个点左侧菜单，抓各列表 API 响应是否含 StepID；点行抓跳转 URL
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const apiDump = [];
    page.on('response', async r => {
      const u = r.url();
      if (/TaskList\.ashx|Task\.ashx|History/i.test(u)) {
        try {
          const t = await r.text();
          const m = (u.match(/method=([A-Za-z]+)/) || [])[1] || '?';
          const hasStep = /"StepID"/i.test(t);
          apiDump.push({ m, hasStep, len: t.length, sample: hasStep ? t.slice(Math.max(0, t.search(/"StepID"/i) - 100), t.search(/"StepID"/i) + 100).replace(/\s+/g, ' ') : '' });
        } catch (e) {}
      }
    });

    log('登录...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    // 逐个点击左侧菜单
    const menus = ['我发起的流程', '待审批', '已审批', '待知悉', '审批中', '已通过'];
    for (const menu of menus) {
      apiDump.length = 0;
      const el = await page.evaluate((txt) => {
        const els = [...document.querySelectorAll('a,span,div')];
        const t = els.find(e => (e.innerText || '').trim() === txt && e.offsetHeight > 0);
        if (t) { t.click(); return true; }
        return false;
      }, menu);
      await wait(6000);
      const uniq = [];
      for (const d of apiDump) if (!uniq.find(x => x.m === d.m && x.hasStep === d.hasStep)) uniq.push(d);
      log(`菜单「${menu}」点击=${el}，接口: ${uniq.map(x => `${x.m}${x.hasStep ? '(★含StepID)' : ''}`).join(', ') || '无新请求'}`);
      for (const d of uniq.filter(x => x.hasStep)) console.log('    sample: ' + d.sample.slice(0, 250));
      await page.screenshot({ path: `reports/debug_menu_${menu}.png` });
    }

    // 点第一行看跳转
    log('点击列表第一行...');
    const navs = [];
    page.on('framenavigated', f => { if (f.url().includes('Process.aspx')) navs.push(f.url()); });
    const clicked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('tr')].filter(r => /REQ\d+/.test(r.innerText));
      if (rows.length) { rows[0].click(); return rows[0].innerText.slice(0, 60).replace(/\n/g, '|'); }
      return null;
    });
    await wait(8000);
    log('点击行: ' + clicked);
    log('跳转URL: ' + JSON.stringify(navs));
    log('当前URL: ' + page.url().slice(0, 200));
  } finally { await b.close().catch(() => {}); }
})();
