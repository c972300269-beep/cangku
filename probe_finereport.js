// 只读探查：时代邻里数据分析平台（FineReport 决策平台）指定 activeTab 页面
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
// Windows 集成认证(NTLM)必须用系统 Chrome，Playwright 自带内核会 ERR_INVALID_AUTH_CREDENTIALS
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'E:\\workbuddy\\Claw\\reports\\finereport';
const URL = process.argv[2] || 'http://10.1.232.246:8089/webroot/decision#?activeTab=9b8028a3-90d7-457a-8824-8d6484cd31d1';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: process.env.FR_HEADED !== '1', executablePath: EXE,
    args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246']
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    // 复用 PowerShell 用 Windows 集成认证换到的帆软会话凭证，绕过 Chromium 的 NTLM 限制
    const SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
    if (fs.existsSync(SESSION)) {
      const sess = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
      const cookies = (sess.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' }));
      await ctx.addCookies(cookies);
      console.log('注入会话 Cookie =', cookies.length, '个 (取于 ' + sess.fetchedAt + ')');
    }
    const page = await ctx.newPage();
    const bad = [], errs = [], fails = [];
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 160)); });
    page.on('console', m => { if (m.type() === 'error') errs.push((m.text() || '').slice(0, 200)); });
    page.on('requestfailed', r => fails.push((r.failure() || {}).errorText + ' ' + r.url().slice(0, 160)));
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    // 帆软平台静态资源较多，domcontentloaded 可能长时间不触发：只等响应头，再单独等渲染
    const resp = await page.goto(URL, { waitUntil: 'commit', timeout: 40000 });
    console.log('HTTP status =', resp && resp.status());
    await wait(35000);
    console.log('最终 URL =', page.url());
    console.log('页面标题 =', await page.title());
    const text = await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 6000));
    console.log('=== 可见文本 ===');
    console.log(text);
    console.log('=== HTML 片段 ===');
    console.log((await page.content()).slice(0, 900));
    console.log('=== 失败/异常请求 (前 20) ===');
    bad.slice(0, 20).forEach(x => console.log('  ', x));
    console.log('  requestfailed:', fails.length);
    fails.slice(0, 10).forEach(x => console.log('  ', x));
    console.log('=== console error (前 12) ===');
    errs.slice(0, 12).forEach(x => console.log('  ', x));
    console.log('=== iframe/frame ===');
    for (const f of page.frames()) console.log('  ', f.url().slice(0, 200));
    console.log('=== 主要链接 ===');
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].slice(0, 40).map(a => (a.innerText || '').trim() + ' -> ' + (a.getAttribute('href') || '')).filter(Boolean));
    links.slice(0, 30).forEach(l => console.log('  ', l.slice(0, 180)));
    await page.screenshot({ path: OUT + '\\probe_activeTab.png' });
    console.log('截图 =', OUT + '\\probe_activeTab.png');
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
