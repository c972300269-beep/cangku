// 时代邻里数据分析平台：用用户新给的密码登录；若强制改密则把它设为新密码（旧密码用上一组）
// 三分支：① 直接登录成功 → 打开目标 Tab ② 强制改密 → 改密后复登 ③ 凭据被拒 → 用当前密码触发改密后再设新密码
// 密码只走环境变量，不落盘；截图/日志全部写 E 盘
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
const NEWPASS = process.env.FR_PASS || '';       // 用户这次给的密码
const CURPASS = process.env.FR_OLD_PASS || '';   // 已验证为当前有效的密码（作改密时的旧密码）
const bodyText = page => page.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, ' | ').slice(0, 900));
const isChpwd = t => /修改密码|当前密码已失效/.test(t);
const isCredErr = t => /用户名或密码|密码错误|账号或密码|User not exist|wrong password|错误码/i.test(t);
// 截图不允许拖垮主流程：SPA 加载时字体可能一直不 ready
async function snap(page, name, opts) {
  try { await page.screenshot(Object.assign({ path: OUT + '\\' + name, timeout: 20000 }, opts || {})); console.log('截图 =', OUT + '\\' + name); }
  catch (e) { console.log('截图跳过 ' + name + ' =', e.message.slice(0, 90)); }
}

async function waitInputs(page) {
  const ready = () => page.evaluate(() => document.querySelectorAll('input').length >= 2).catch(() => false);
  if (await ready()) { console.log('控件已在页面上，无需等待'); return true; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) { console.log('控件未就绪，重载第 ' + (attempt - 1) + ' 次'); await page.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {}); }
    await wait(attempt === 1 ? 35000 : 28000);
    let ok = await ready();
    if (!ok) { await wait(12000); ok = await ready(); }
    if (ok) return true;
  }
  return false;
}

async function gotoLogin(page) {
  for (let i = 1; i <= 3; i++) {
    try { const r = await page.goto(LOGIN, { waitUntil: 'commit', timeout: 60000 }); console.log('登录页 HTTP =', r && r.status()); break; }
    catch (e) { console.log('登录页 goto 第 ' + i + ' 次超时 =', e.message.slice(0, 90)); await wait(3000); if (i === 3) return false; }
  }
  return await waitInputs(page);
}

async function doLogin(page, pass, tag, shot) {
  console.log('--- ' + tag + ' 输入账号与密码 ---');
  await page.locator('input:not([type=password]):not([type=checkbox]):not([type=hidden])').first().fill(USER, { timeout: 10000 });
  await page.locator('input[type=password]').first().fill(pass, { timeout: 10000 });
  await wait(600);
  console.log(tag + ' 填后回读 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, len: (i.value || '').length, endsDot: (i.value || '').endsWith('.'), hasAt: (i.value || '').includes('@') })))));
  await snap(page, shot);
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
  await wait(12000);
  const t = await bodyText(page);
  console.log(tag + ' 登录后 URL =', page.url());
  console.log(tag + ' 登录后文本 =', t);
  await snap(page, shot.replace('.png', '_after.png'));
  return t;
}

async function changePassword(page, oldPass, newPass) {
  console.log('=== 提交修改密码 ===');
  const pw = page.locator('input[type=password]');
  const n = await pw.count();
  console.log('改密密码框数量 =', n);
  if (n < 3) { console.log('ERR 密码框不足 3 个，放弃'); return null; }
  const vals = [oldPass, newPass, newPass];
  const labels = ['旧密码', '新密码', '确认新密码'];
  for (let i = 0; i < 3; i++) { await pw.nth(i).fill(vals[i], { timeout: 8000 }); console.log('已填 ' + labels[i] + ' (长度 ' + vals[i].length + ')'); }
  await wait(600);
  console.log('改密框回读 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input[type=password]')].map(i => (i.value || '').length))));
  await snap(page, 'final_chpwd_filled.png');
  const btn = page.getByText('确定', { exact: true });
  console.log('「确定」数量 =', await btn.count());
  if (await btn.count()) await btn.last().click({ timeout: 8000 }).catch(e => console.log('点击确定失败 =', e.message.slice(0, 90)));
  await wait(10000);
  const t = await bodyText(page);
  console.log('提交后 URL =', page.url());
  console.log('提交后文本 =', t);
  const ck = await page.context().cookies();
  console.log('提交后 cookie =', ck.map(c => c.name).join(','));
  await snap(page, 'final_chpwd_submit.png');
  return t;
}

async function openTarget(page) {
  console.log('=== 打开目标 activeTab ===');
  const r = await page.goto(TARGET, { waitUntil: 'commit', timeout: 60000 });
  console.log('目标页 HTTP =', r && r.status());
  for (let i = 0; i < 10; i++) {
    await wait(5000);
    const len = await page.evaluate(() => (document.body.innerText || '').trim().length).catch(() => 0);
    console.log('  等待 ' + ((i + 1) * 5) + 's : 文本长度=' + len);
    if (len > 40) break;
  }
  console.log('目标页 URL =', page.url());
  console.log('目标页文本 =', (await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 5000))));
  console.log('=== iframe ===');
  for (const f of page.frames()) console.log('  ', f.url().slice(0, 200));
  await snap(page, 'final_target.png', { fullPage: true });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!NEWPASS) { console.log('ERR 缺少 FR_PASS'); process.exit(2); }
  console.log('账号 =', USER, '| 本次密码长度 =', NEWPASS.length, '末尾点 =', NEWPASS.endsWith('.'), '| 旧密码长度 =', CURPASS.length);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    if (fs.existsSync(DOMAIN_SESSION)) {
      const s = JSON.parse(fs.readFileSync(DOMAIN_SESSION, 'utf8').replace(/^\uFEFF/, ''));
      await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    }
    const page = await ctx.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    page.on('response', async r => {
      if (r.request().method() === 'POST' && /login|pass|pwd|user|chang/i.test(r.url())) {
        try { console.log('POST', r.status(), r.url().slice(-80), '=', (await r.text()).slice(0, 260)); } catch (e) {}
      }
    });

    if (!await gotoLogin(page)) { console.log('ERR 登录页打不开'); return; }
    console.log('输入框 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder })))));

    // 分支 ① 用本次给的密码直接登录
    let needRelogin = true;
    let t = await doLogin(page, NEWPASS, '首次登录', 'final_login_filled.png');
    if (isChpwd(t)) {
      console.log('→ 仍强制改密，把本次密码设为新密码');
      t = await changePassword(page, CURPASS || NEWPASS, NEWPASS);
    } else if (isCredErr(t)) {
      console.log('→ 本次密码登录被拒，改用当前有效密码触发改密流程');
      if (!await gotoLogin(page)) { console.log('ERR 无法回到登录页'); return; }
      const t2 = await doLogin(page, CURPASS, '当前密码登录', 'final_curpass_filled.png');
      if (!isChpwd(t2)) { console.log('ERR 当前密码也没能进入改密流程，停止，文本 =', t2); return; }
      t = await changePassword(page, CURPASS, NEWPASS);
    } else {
      console.log('→ 本次密码直接登录成功，无需改密');
      needRelogin = false; // 会话已有效，不再复登（已登录时 goto /login 会被重定向）
    }
    if (t && isChpwd(t)) { console.log('ERR 改密未通过（见提交后文本），账号密码未被改动，停止后续动作'); return; }

    // 复登验证：改过密码才需要用新密码重新登一次；直接登录成功的会话已有效，跳过
    console.log('=== 复登验证 ===');
    if (needRelogin) {
      if (!await gotoLogin(page)) { console.log('ERR 复登时登录页打不开'); return; }
      const t3 = await doLogin(page, NEWPASS, '复登', 'final_relogin_filled.png');
      if (isChpwd(t3)) { console.log('ERR 复登仍被改密拦住，未打开目标 Tab'); return; }
      if (isCredErr(t3)) { console.log('ERR 复登凭据被拒，未打开目标 Tab'); return; }
    } else { console.log('首次登录已成功，跳过复登'); }
    const cookies = await ctx.cookies();
    console.log('最终 cookie =', cookies.map(c => c.name).join(','));
    const keep = cookies.filter(c => /fine_auth_token|fine_remember_login|JSESSIONID/i.test(c.name));
    fs.writeFileSync(USER_SESSION, JSON.stringify({ fetchedAt: new Date().toISOString(), user: USER, cookies: keep.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path })) }, null, 2), 'utf8');
    await openTarget(page);
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
