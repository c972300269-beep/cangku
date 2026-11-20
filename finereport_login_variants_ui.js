// 真实 UI 路径测试用户名写法：逐个填表 + 点「登录」，抓服务端真实响应
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
const LOGIN = 'http://10.1.232.246:8089/webroot/decision/login';
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PASS = process.env.FR_PASS || '';
const VARIANTS = process.env.FR_VARIANTS
  ? JSON.parse(process.env.FR_VARIANTS)
  : ['TIMESGROUP\\yaoshiyun1', 'yaoshiyun1@timesgroup.cn'];

(async () => {
  if (!PASS) { console.log('ERR 缺少 FR_PASS'); process.exit(2); }
  const engine = process.env.FR_ENGINE || 'bundled';
  const launch = { headless: true, args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] };
  if (engine === 'system') launch.executablePath = EXE;
  console.log('浏览器内核 =', engine);
  const browser = await chromium.launch(launch);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    const page = await ctx.newPage();
    let lastLoginResp = null;
    page.on('response', async resp => {
      if (resp.request().method() === 'POST' && /\/decision\/login/.test(resp.url())) {
        let b = ''; try { b = (await resp.text()).slice(0, 400); } catch (e) {}
        lastLoginResp = { status: resp.status(), body: b.replace(/\s+/g, ' ').slice(0, 250) };
      }
    });
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

    await page.goto(LOGIN, { waitUntil: 'commit', timeout: 40000 });
    await wait(35000);
    let ready = await page.evaluate(() => document.querySelectorAll('input').length > 0);
    if (!ready) { await wait(15000); ready = await page.evaluate(() => document.querySelectorAll('input').length > 0); }
    // 等 i18n 就绪：按钮显示中文「登录」而不是 Dec-Basic_Login
    for (let i = 0; i < 12; i++) {
      const t = await page.evaluate(() => document.body.innerText || '');
      if (/登录/.test(t)) { console.log('i18n 就绪，等待 ' + (35 + i * 3) + 's'); break; }
      await wait(3000);
    }
    console.log('登录控件就绪 =', ready);

    for (const u of VARIANTS) {
      lastLoginResp = null;
      await page.evaluate(([user, p]) => {
        const a = document.querySelector('input:not([type=password]):not([type=checkbox]):not([type=hidden])');
        const b = document.querySelector('input[type=password]');
        if (a) { a.value = user; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); }
        if (b) { b.value = p; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true })); }
      }, [u, PASS]);
      await wait(700);
      const readback = await page.evaluate(() => {
        const a = document.querySelector('input:not([type=password]):not([type=checkbox]):not([type=hidden])');
        const b = document.querySelector('input[type=password]');
        return { user: a ? a.value : null, passLen: b ? b.value.length : 0, passEndsDot: b ? b.value.endsWith('.') : false };
      });
      const hitDesc = await page.evaluate(() => {
        const vis = e => e.getBoundingClientRect().width > 0;
        const els = [...document.querySelectorAll('button, a, div, span, input[type=button], input[type=submit]')];
        const short = e => ((e.innerText || e.value || '').trim().length < 20);
        let hit = els.filter(e => (e.innerText || e.value || '').trim() === '登录' && vis(e) && short(e));
        if (!hit.length) hit = els.filter(e => (e.innerText || e.value || '').trim() === 'Dec-Basic_Login' && vis(e) && short(e));
        if (!hit.length) hit = els.filter(e => /登录|Basic_Login/i.test((e.innerText || e.value || '').trim()) && vis(e) && short(e));
        const t = hit[hit.length - 1] || hit[0];
        if (t) { t.click(); return t.tagName + ':' + (t.innerText || t.value || '').trim().slice(0, 30); }
        return null;
      });
      console.log('  点击按钮 =', hitDesc);
      await wait(6000);
      const txt = (await page.evaluate(() => (document.body.innerText || '').slice(0, 300))).replace(/\s+/g, ' ');
      console.log('--- ' + u + ' ---');
      console.log('  回读:', JSON.stringify(readback));
      console.log('  响应:', JSON.stringify(lastLoginResp));
      console.log('  URL:', page.url());
      console.log('  页面:', txt.slice(0, 180));
      if (lastLoginResp && !/21300007|wrong password|用户名或密码错误/i.test(lastLoginResp.body + txt)) {
        console.log('  >>> 可能登录成功，需进一步确认');
      }
      await wait(1500);
    }
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
