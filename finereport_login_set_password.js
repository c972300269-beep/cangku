// 时代邻里数据分析平台：在登录页输入用户指定的账号/新密码 → 点登录 → 若强制改密则把该密码正式设为新密码 → 复登验证
// 用法：FR_PASS='xxx' node finereport_login_set_password.js
// 密码只走环境变量，不落盘；所有截图/日志写 E 盘
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = 'E:\\workbuddy\\Claw';
const OUT = ROOT + '\\reports\\finereport';
const DOMAIN_SESSION = ROOT + '\\.workbuddy\\finereport_session.json';
const USER_SESSION = ROOT + '\\.workbuddy\\finereport_session_user.json';
const BASE = 'http://10.1.232.246:8089/webroot/decision';
const LOGIN = BASE + '/login';
const TARGET = BASE + '#?activeTab=9b8028a3-90d7-457a-8824-8d6484cd31d1';
const USER = process.env.FR_USER || 'yaoshiyun1';
const PASS = process.env.FR_PASS || '';
const bodyText = page => page.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, ' | ').slice(0, 900));

async function waitInputs(page) {
  const ready = () => page.evaluate(() => document.querySelectorAll('input').length >= 2).catch(() => false);
  if (await ready()) { console.log('控件已在页面上，无需等待'); return true; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) { console.log('控件未就绪，重载第 ' + (attempt - 1) + ' 次'); await page.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {}); }
    await wait(attempt === 1 ? 35000 : 28000);
    let ok = await page.evaluate(() => document.querySelectorAll('input').length >= 2).catch(() => false);
    if (!ok) { await wait(12000); ok = await page.evaluate(() => document.querySelectorAll('input').length >= 2).catch(() => false); }
    if (ok) return true;
  }
  return false;
}

async function fillLogin(page, tag) {
  const u = 'input:not([type=password]):not([type=checkbox]):not([type=hidden])';
  const p = 'input[type=password]';
  await page.locator(u).first().fill(USER, { timeout: 10000 });
  await page.locator(p).first().fill(PASS, { timeout: 10000 });
  await wait(600);
  const rb = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, len: (i.value || '').length, hasAt: (i.value || '').includes('@') })));
  console.log(tag + ' 填后回读 =', JSON.stringify(rb));
  const shot = tag === '复登' ? 'relogin_filled.png' : 'login_filled.png';
  await page.screenshot({ path: OUT + '\\' + shot });
  console.log(tag + ' 输入完成截图 =', OUT + '\\' + shot);
  const hit = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, div, span, input[type=button], input[type=submit]')];
    const vis = e => e.getBoundingClientRect().width > 0;
    let h = els.filter(e => (e.innerText || e.value || '').trim() === '登录' && vis(e));
    if (!h.length) h = els.filter(e => /登录|Basic_Login/i.test((e.innerText || e.value || '').trim()) && vis(e) && (e.innerText || '').trim().length < 20);
    const t = h[h.length - 1] || h[0];
    if (t) { t.click(); return (t.innerText || t.value || '').trim(); }
    return null;
  });
  console.log(tag + ' 点击「登录」= ', hit);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!PASS) { console.log('ERR 缺少 FR_PASS'); process.exit(2); }
  console.log('账号 =', USER, '| 密码长度 =', PASS.length, '| 含@ =', PASS.includes('@'));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    // 带域集成认证的 cookie 过 IIS 层（实测不带时静态资源易卡住）
    if (fs.existsSync(DOMAIN_SESSION)) {
      const s = JSON.parse(fs.readFileSync(DOMAIN_SESSION, 'utf8').replace(/^\uFEFF/, ''));
      await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    }
    const page = await ctx.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    page.on('response', async r => {
      const req = r.request();
      if (req.method() === 'POST' && /login|pass|user|pwd|chang/i.test(r.url())) {
        try { console.log('POST 响应', r.status(), r.url().slice(-90), '=', (await r.text()).slice(0, 260)); } catch (e) {}
      }
    });

    // ===== STEP 1 登录页输入账号密码 =====
    console.log('=== STEP 1 打开登录页并输入账号密码 ===');
    let ok = false;
    for (let i = 1; i <= 3 && !ok; i++) {
      try { const r = await page.goto(LOGIN, { waitUntil: 'commit', timeout: 60000 }); console.log('登录页 HTTP =', r && r.status()); ok = true; }
      catch (e) { console.log('登录页 goto 第 ' + i + ' 次超时 =', e.message.slice(0, 90)); await wait(3000); }
    }
    if (!ok) { console.log('ERR 登录页打不开'); return; }
    console.log('控件就绪 =', await waitInputs(page));
    console.log('输入框 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder })))));
    await fillLogin(page, '首次');
    await wait(12000);
    let t1 = await bodyText(page);
    console.log('点登录后 URL =', page.url());
    console.log('点登录后文本 =', t1);
    await page.screenshot({ path: OUT + '\\login_after_click.png' });
    const needChpwd = /修改密码|当前密码已失效/.test(t1);
    console.log('是否强制改密 =', needChpwd);

    // ===== STEP 2 把用户给的新密码正式设上去 =====
    if (needChpwd) {
      console.log('=== STEP 2 在修改密码弹窗填入新密码并提交 ===');
      const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder, cls: (i.className || '').toString().slice(0, 40) })));
      console.log('改密弹窗输入框 =', JSON.stringify(inputs));
      // 实测：帆软改密框无 placeholder 属性（提示文字是兄弟节点），只能按出现顺序填 3 个密码框
      const pw = page.locator('input[type=password]');
      const pwCount = await pw.count();
      console.log('改密密码框数量 =', pwCount);
      const labels = ['旧密码', '新密码', '确认新密码'];
      for (let i = 0; i < Math.min(3, pwCount); i++) {
        await pw.nth(i).fill(PASS, { timeout: 8000 });
        console.log('已填第 ' + (i + 1) + ' 框 (' + labels[i] + ')');
      }
      await wait(600);
      console.log('改密框回读 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, len: (i.value || '').length })))));
      await page.screenshot({ path: OUT + '\\chpwd_filled.png' });
      console.log('改密填写截图 =', OUT + '\\chpwd_filled.png');
      const btn = page.getByText('确定', { exact: true });
      console.log('「确定」数量 =', await btn.count());
      if (await btn.count()) await btn.last().click({ timeout: 8000 }).catch(e => console.log('点击确定失败 =', e.message.slice(0, 90)));
      await wait(10000);
      const t2 = await bodyText(page);
      console.log('提交后 URL =', page.url());
      console.log('提交后文本 =', t2);
      console.log('提交后是否仍改密 =', /修改密码|当前密码已失效/.test(t2));
      console.log('提交后 cookie =', (await ctx.cookies()).map(c => c.name).join(','));
      await page.screenshot({ path: OUT + '\\chpwd_submit.png' });
      console.log('提交结果截图 =', OUT + '\\chpwd_submit.png');
      if (/修改密码|当前密码已失效/.test(t2)) { console.log('ERR 改密未通过，停止后续动作（不反复提交）'); return; }
    }

    // ===== STEP 3 刷新登录页，用账号密码复登验证 =====
    console.log('=== STEP 3 复登验证 ===');
    try { const rr = await page.goto(LOGIN, { waitUntil: 'commit', timeout: 60000 }); console.log('刷新登录页 HTTP =', rr && rr.status()); }
    catch (e) { console.log('刷新登录页异常 =', e.message.slice(0, 90)); }
    console.log('控件就绪 =', await waitInputs(page));
    const tPre = await bodyText(page);
    console.log('刷新后 URL =', page.url());
    console.log('刷新后文本 =', tPre);
    if (!/修改密码/.test(tPre) && /\/login/.test(page.url())) { await fillLogin(page, '复登'); await wait(12000); }
    else if (!/\/login/.test(page.url())) { console.log('刷新后已不在登录页，视为会话有效，跳过复登'); }
    else { console.log('刷新后仍是改密界面，不再重复提交'); }
    const t3 = await bodyText(page);
    console.log('复登后 URL =', page.url());
    console.log('复登后文本 =', t3);
    const stillChpwd = /修改密码|当前密码已失效/.test(t3);
    console.log('复登是否仍改密 =', stillChpwd);
    const cookies = await ctx.cookies();
    console.log('复登后 cookie =', cookies.map(c => c.name).join(','));
    const keep = cookies.filter(c => /fine_auth_token|fine_remember_login|JSESSIONID/i.test(c.name));
    fs.writeFileSync(USER_SESSION, JSON.stringify({ fetchedAt: new Date().toISOString(), user: USER, cookies: keep.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path })) }, null, 2), 'utf8');
    await page.screenshot({ path: OUT + '\\final_login_state.png' });
    if (stillChpwd) { console.log('复登仍被改密拦住，未打开目标 Tab'); return; }

    // ===== STEP 4 打开目标 activeTab =====
    console.log('=== STEP 4 打开目标 activeTab ===');
    const r4 = await page.goto(TARGET, { waitUntil: 'commit', timeout: 60000 });
    console.log('目标页 HTTP =', r4 && r4.status());
    for (let i = 0; i < 8; i++) {
      await wait(5000);
      const len = await page.evaluate(() => (document.body.innerText || '').trim().length).catch(() => 0);
      console.log('  等待 ' + ((i + 1) * 5) + 's : 文本长度=' + len);
      if (len > 40) break;
    }
    console.log('目标页 URL =', page.url());
    console.log('目标页文本 =', (await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 4000))));
    await page.screenshot({ path: OUT + '\\final_target.png', fullPage: true });
    console.log('目标页截图 =', OUT + '\\final_target.png');
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
