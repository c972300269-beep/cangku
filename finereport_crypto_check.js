// 验证帆软登录前端加密是否把密码末尾的句点丢掉
// 关键：拦截 POST 请求并 fulfill 假响应，请求不真正发给服务端 → 零失败计数、零锁定风险
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const crypto = require('crypto');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
const LOGIN = 'http://10.1.232.246:8089/webroot/decision/login';
const USER = process.env.FR_USER || 'yaoshiyun1';
const PASS = process.env.FR_PASS || '';
const VARIANTS = process.env.FR_VARIANTS ? JSON.parse(process.env.FR_VARIANTS) : [PASS, PASS.replace(/\.$/, ''), PASS];

(async () => {
  if (!PASS) { console.log('ERR 缺少 FR_PASS'); process.exit(2); }
  const captured = [];
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
    await page.route('**/webroot/decision/login', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        captured.push(req.postData());
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"errorCode":"21300007","errorMsg":"(intercepted for diagnosis)"}' });
      }
      return route.continue();
    });

    await page.goto(LOGIN, { waitUntil: 'commit', timeout: 40000 });
    await wait(35000);
    let ready = await page.evaluate(() => document.querySelectorAll('input').length > 0);
    if (!ready) { await wait(15000); ready = await page.evaluate(() => document.querySelectorAll('input').length > 0); }
    console.log('控件就绪 =', ready, '| 内核 = playwright bundled');

    const userSel = 'input:not([type=password]):not([type=checkbox]):not([type=hidden])';
    const passSel = 'input[type=password]';

    for (let i = 0; i < VARIANTS.length; i++) {
      const v = VARIANTS[i];
      await page.evaluate(([us, ps, u, p]) => {
        const a = document.querySelector(us), b = document.querySelector(ps);
        if (a) { a.value = u; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); }
        if (b) { b.value = p; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true })); }
      }, [userSel, passSel, USER, v]);
      await wait(700);
      const read = await page.evaluate(() => {
        const b = document.querySelector('input[type=password]');
        return b ? { len: b.value.length, endsWithDot: b.value.endsWith('.') } : null;
      });
      const before = captured.length;
      await page.evaluate(() => {
        const els = [...document.querySelectorAll('button, a, div, span, input[type=button], input[type=submit]')];
        const hit = els.filter(e => (e.innerText || e.value || '').trim() === '登录' && e.getBoundingClientRect().width > 0);
        const t = hit[hit.length - 1] || hit[0];
        if (t) t.click();
      });
      await wait(3500);
      const payload = captured[captured.length - 1];
      let enc = null, fields = null;
      if (payload) {
        try { const o = JSON.parse(payload); enc = o.password; fields = Object.keys(o); } catch (e) { enc = '(parse fail)'; }
      }
      const fp = enc ? crypto.createHash('sha256').update(String(enc)).digest('hex').slice(0, 16) : '(none)';
      console.log('变体#' + i + ' 输入长度=' + read?.len + ' 末尾有点=' + read?.endsWithDot +
        ' | 新请求=' + (captured.length - before) + ' | 密文长度=' + (enc ? String(enc).length : 0) +
        ' | 密文指纹=' + fp + ' | 字段=' + (fields ? fields.join(',') : '-'));
    }

    console.log('=== 结论 ===');
    const fps = captured.map(p => { try { return crypto.createHash('sha256').update(String(JSON.parse(p).password)).digest('hex').slice(0, 16); } catch (e) { return '(none)'; } });
    console.log('各次密文指纹:', JSON.stringify(fps));
    if (fps.length >= 2) {
      console.log('带点 vs 不带点 密文是否相同 =', fps[0] === fps[1]);
      if (fps[0] === fps[1]) console.log('>>> 前端加密把末尾句点丢掉了，这就是登录失败原因');
      else console.log('>>> 前端加密确实把句点算进去了，登录失败与句点无关');
    }
    if (fps.length >= 3) console.log('同一明文两次加密是否确定 =', fps[0] === fps[2]);
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
