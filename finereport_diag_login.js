// 诊断帆软登录：抓取真实 POST 请求体 / 服务端响应 / 隐藏字段 / 登录方式切换
// 密码只从环境变量传入，不落盘；输出中对密码字段只打印长度与结构特征，不打印明文
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
const OUT = 'E:\\workbuddy\\Claw\\reports\\finereport';
const LOGIN = 'http://10.1.232.246:8089/webroot/decision/login';
const USER = process.env.FR_USER || '';
const PASS = process.env.FR_PASS || '';

function shape(v) {
  if (v === null || v === undefined) return '(null)';
  const s = String(v);
  return {
    len: s.length,
    endsWithDot: s.endsWith('.'),
    looksHashed: /^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$/.test(s),
    looksBase64: /^[A-Za-z0-9+/=]{16,}$/.test(s) && !/^[a-zA-Z0-9._-]+$/.test(s),
    head: s.slice(0, 1), tail: s.slice(-1)
  };
}
function redact(data) {
  if (!data) return { raw: String(data) };
  let obj = null, kind = 'raw';
  try { obj = JSON.parse(data); kind = 'json'; }
  catch (e) {
    obj = {};
    data.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) obj[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    kind = 'form';
  }
  const safe = {};
  Object.keys(obj || {}).forEach(k => {
    safe[k] = /pass|pwd|secret|token|credential/i.test(k) ? shape(obj[k]) : (String(obj[k]).slice(0, 120));
  });
  return { kind, keys: Object.keys(obj || {}), safe };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!USER || !PASS) { console.log('ERR 缺少 FR_USER / FR_PASS'); process.exit(2); }
  const browser = await chromium.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246']
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    if (fs.existsSync(SESSION)) {
      const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
      await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    }
    const page = await ctx.newPage();
    const posts = [], resps = [], errs = [], fails = [];
    page.on('request', req => {
      if (req.method() === 'POST') posts.push({ url: req.url(), ct: req.headers()['content-type'] || '', data: req.postData() });
    });
    page.on('response', async resp => {
      const req = resp.request();
      if (req.method() === 'POST' || /login|auth|token|captcha|verify/i.test(resp.url())) {
        let body = '';
        try { body = (await resp.text()).slice(0, 700); } catch (e) { body = '(读取失败)'; }
        resps.push({ status: resp.status(), url: resp.url().slice(0, 180), body: body.replace(/\s+/g, ' ').slice(0, 400) });
      }
    });
    page.on('console', m => { if (m.type() === 'error') errs.push((m.text() || '').slice(0, 180)); });
    page.on('requestfailed', r => fails.push((r.failure() || {}).errorText + ' ' + r.url().slice(0, 120)));
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

    const r = await page.goto(LOGIN, { waitUntil: 'commit', timeout: 40000 });
    console.log('登录页 HTTP =', r && r.status());
    await wait(35000);
    let ready = await page.evaluate(() => document.querySelectorAll('input').length > 0);
    if (!ready) { await wait(15000); ready = await page.evaluate(() => document.querySelectorAll('input').length > 0); }
    console.log('控件就绪 =', ready);

    // 页面结构：所有 input（含 hidden）、登录方式切换、验证码
    const dom = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll('input')].map(i => ({ type: i.type, name: i.name, id: i.id, ph: i.placeholder, maxLength: i.maxLength, hidden: !!i.closest('[style*="display: none"]') })),
      captcha: [...document.querySelectorAll('img')].filter(i => /captcha|verify|code/i.test(i.src || i.id || i.className || '')).map(i => (i.src || '').slice(0, 120)),
      tabs: [...document.querySelectorAll('[class*="tab"],[class*="Tab"],a,li')].map(e => (e.innerText || '').trim()).filter(t => t && t.length < 20 && /登录|域|LDAP|账号|SSO|平台/.test(t)).slice(0, 20),
      bodyText: (document.body.innerText || '').slice(0, 400)
    }));
    console.log('=== 页面结构 ===');
    console.log(JSON.stringify(dom, null, 2));

    // 填表
    const userSel = 'input:not([type=password]):not([type=checkbox]):not([type=hidden])';
    const passSel = 'input[type=password]';
    try { await page.locator(userSel).first().fill(USER, { timeout: 8000 }); } catch (e) {
      await page.evaluate(([s, v]) => { const el = document.querySelector(s); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }, [userSel, USER]);
    }
    try { await page.locator(passSel).first().fill(PASS, { timeout: 8000 }); } catch (e) {
      await page.evaluate(([s, v]) => { const el = document.querySelector(s); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }, [passSel, PASS]);
    }
    await wait(800);
    const before = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, type: i.type, len: (i.value || '').length, endsWithDot: (i.value || '').endsWith('.') })));
    console.log('=== 提交前输入框回读 ===');
    console.log(JSON.stringify(before));

    posts.length = 0; resps.length = 0;
    const clicked = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, div, span, input[type=button], input[type=submit]')];
      const hit = els.filter(e => (e.innerText || e.value || '').trim() === '登录' && e.getBoundingClientRect().width > 0);
      const t = hit[hit.length - 1] || hit[0];
      if (t) { t.click(); return t.tagName + '.' + String(t.className || '').slice(0, 40); }
      return null;
    });
    console.log('点击登录 =', clicked);
    await wait(15000);

    console.log('=== 实际发出的 POST 请求 ===');
    if (!posts.length) console.log('  （无 POST 请求）');
    posts.forEach(p => {
      console.log('  URL:', p.url.slice(0, 200));
      console.log('  Content-Type:', p.ct);
      console.log('  Payload:', JSON.stringify(redact(p.data)));
    });
    console.log('=== 相关响应 ===');
    resps.slice(0, 12).forEach(x => console.log('  ' + x.status + ' ' + x.url + '\n     ' + x.body.slice(0, 260)));
    console.log('=== 登录后状态 ===');
    console.log('  URL:', page.url());
    console.log('  文本:', (await page.evaluate(() => (document.body.innerText || '').slice(0, 400))).replace(/\n+/g, ' | '));
    console.log('=== console error / failed ===');
    console.log('  errors:', errs.length, errs.slice(0, 6));
    console.log('  failed:', fails.length, fails.slice(0, 6));
    const cookies = await ctx.cookies();
    console.log('=== 当前 cookie ===');
    cookies.filter(c => /fine|JSESSION|auth/i.test(c.name)).forEach(c => console.log('  ' + c.name + ' len=' + c.value.length));
    await page.screenshot({ path: OUT + '\\diag_login.png' });
    console.log('截图 =', OUT + '\\diag_login.png');
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
