// 用页面自身的加密结果，测试帆软登录的用户名常见写法（带域前缀 / 邮箱 / 原样对照）
// 密码只用运行时环境变量；密文在内存里传递，不落盘
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
const LOGIN = 'http://10.1.232.246:8089/webroot/decision/login';
const PASS = process.env.FR_PASS || '';
const VARIANTS = process.env.FR_VARIANTS
  ? JSON.parse(process.env.FR_VARIANTS)
  : ['yaoshiyun1', 'TIMESGROUP\\yaoshiyun1', 'yaoshiyun1@timesgroup.cn'];

(async () => {
  if (!PASS) { console.log('ERR 缺少 FR_PASS'); process.exit(2); }
  let encrypted = null;
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246']
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    const page = await ctx.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

    // 阶段一：拦截一次真实提交，只为取得前端加密后的密码密文（请求不发给服务端）
    const handler = async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        try { encrypted = JSON.parse(req.postData()).password; } catch (e) {}
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"errorCode":"21300007"}' });
      }
      return route.continue();
    };
    await page.route('**/webroot/decision/login', handler);
    await page.goto(LOGIN, { waitUntil: 'commit', timeout: 40000 });
    await wait(35000);
    let ready = await page.evaluate(() => document.querySelectorAll('input').length > 0);
    if (!ready) { await wait(15000); }
    await page.evaluate(p => {
      const a = document.querySelector('input:not([type=password]):not([type=hidden])');
      const b = document.querySelector('input[type=password]');
      if (a) { a.value = 'yaoshiyun1'; a.dispatchEvent(new Event('input', { bubbles: true })); }
      if (b) { b.value = p; b.dispatchEvent(new Event('input', { bubbles: true })); }
    }, PASS);
    await wait(700);
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, div, span')];
      const hit = els.filter(e => (e.innerText || '').trim() === '登录' && e.getBoundingClientRect().width > 0);
      const t = hit[hit.length - 1] || hit[0]; if (t) t.click();
    });
    await wait(3000);
    await page.unroute('**/webroot/decision/login', handler);
    console.log('取得密文 =', !!encrypted, '| 长度 =', encrypted ? encrypted.length : 0);
    if (!encrypted) { console.log('ERR 未取得密文，放弃'); return; }

    // 阶段二：在页面上下文用 fetch 逐个测试用户名写法
    console.log('=== 用户名变体测试（每次都是真实提交）===');
    for (const u of VARIANTS) {
      const out = await page.evaluate(async ([user, enc]) => {
        try {
          const r = await fetch('/webroot/decision/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ username: user, password: enc, validity: '-1', sliderToken: '', origin: '', encrypted: 'true' })
          });
          const t = await r.text();
          return { status: r.status, body: t.slice(0, 300) };
        } catch (e) { return { status: -1, body: String(e).slice(0, 200) }; }
      }, [u, encrypted]);
      console.log('  ' + u + ' -> HTTP ' + out.status + ' | ' + out.body.replace(/\s+/g, ' ').slice(0, 220));
    }
    const cookies = await ctx.cookies();
    console.log('=== 最终 cookie ===');
    cookies.filter(c => /fine_auth_token|fine_remember/i.test(c.name)).forEach(c => console.log('  ' + c.name + ' len=' + c.value.length));
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
