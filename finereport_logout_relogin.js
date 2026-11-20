// 时代邻里数据分析平台：先「退出当前账号」，再从登录页「重新点登录」
// 用途：排除旧会话/域集成认证残留对指定账号登录的干扰
// 用法：FR_PASS='xxx' FR_USER='yaoshiyun1' node finereport_logout_relogin.js
// 所有截图/会话/日志均写 E 盘；密码只走环境变量，不落盘到脚本
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

async function clickByText(page, src) {
  return await page.evaluate((s) => {
    const rx = new RegExp(s, 'i');
    const els = [...document.querySelectorAll('button,a,div,span,li,td,i,input')];
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = e => (e.innerText || e.title || e.getAttribute('aria-label') || e.value || '').trim();
    const cand = els.filter(e => vis(e) && rx.test(txt(e)) && txt(e).length < 24);
    const t = cand[cand.length - 1];
    if (t) { t.click(); return { tag: t.tagName, text: txt(t).slice(0, 30), cls: (t.className || '').toString().slice(0, 50) }; }
    return null;
  }, src);
}

async function probe(page) {
  return await page.evaluate(() => {
    const W = innerWidth;
    const all = [...document.querySelectorAll('*')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && ((e.innerText || e.title || e.getAttribute('aria-label') || '').trim().length > 0);
    });
    const txt = e => (e.innerText || e.title || e.getAttribute('aria-label') || '').trim();
    const kw = /退出|注销|登录|账号|账户|用户|个人|设置|log ?out|sign ?out/i;
    const uniq = arr => arr.filter((v, i, a) => a.findIndex(z => z.text === v.text && z.x === v.x && z.y === v.y) === i);
    const hits = uniq(all.filter(e => kw.test(txt(e)) && txt(e).length < 30).map(e => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, cls: (e.className || '').toString().slice(0, 60), text: txt(e).slice(0, 30), x: Math.round(r.x), y: Math.round(r.y) };
    })).slice(-40);
    const topRight = uniq(all.filter(e => { const r = e.getBoundingClientRect(); return r.x > W * 0.6 && r.y < 140; }).map(e => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, cls: (e.className || '').toString().slice(0, 60), text: txt(e).slice(0, 30), title: e.title || '', x: Math.round(r.x), y: Math.round(r.y) };
    })).slice(-30);
    return { url: location.href, title: document.title, body: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 900), hits, topRight };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!PASS) { console.log('ERR 缺少 FR_PASS'); process.exit(2); }
  const engine = process.env.FR_ENGINE || 'bundled';
  console.log('浏览器内核 =', engine, '| 账号 =', USER);
  const launch = { headless: true, args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] };
  if (engine === 'system') launch.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch(launch);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    // 载入已有的（域集成认证）会话，模拟"已经进去、且当前登录着我的账号"
    if (fs.existsSync(DOMAIN_SESSION)) {
      const s = JSON.parse(fs.readFileSync(DOMAIN_SESSION, 'utf8').replace(/^\uFEFF/, ''));
      await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
      console.log('已载入原有登录态 cookie:', (s.cookies || []).map(c => c.name).join(','));
    }
    const page = await ctx.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    page.on('response', async r => {
      if (r.request().method() === 'POST' && /\/login(\?|$)/.test(r.url())) {
        try { console.log('登录响应 =', (await r.text()).slice(0, 300)); } catch (e) {}
      }
    });

    // ===== STEP 1 进入平台 =====
    console.log('=== STEP 1 打开平台主页 ===');
    const r1 = await page.goto(BASE, { waitUntil: 'commit', timeout: 40000 });
    console.log('HTTP =', r1 && r1.status());
    for (let i = 0; i < 14; i++) {
      await wait(5000);
      const len = await page.evaluate(() => (document.body.innerText || '').trim().length).catch(() => 0);
      console.log('  等待 ' + ((i + 1) * 5) + 's : 文本长度=' + len);
      if (len > 40) break;
    }
    let p = await probe(page);
    console.log('主页 URL =', p.url, '| title =', p.title);
    console.log('主页文本 =', p.body);
    console.log('=== 含登录/退出/账号关键字的可见控件 ===');
    console.log(JSON.stringify(p.hits));
    console.log('=== 右上角区域控件 ===');
    console.log(JSON.stringify(p.topRight));
    await page.screenshot({ path: OUT + '\\logout_step1_home.png' });
    console.log('主页截图 =', OUT + '\\logout_step1_home.png');

    // ===== STEP 2 在 UI 上退出当前账号（陈家林）=====
    console.log('=== STEP 2 退出当前账号 ===');
    const acctCount = await page.locator('.dec-header-account').count();
    console.log('右上角账号控件数量 =', acctCount);
    try { await page.locator('.dec-header-account').first().click({ timeout: 10000 }); console.log('已用真实鼠标点开「陈家林」下拉'); }
    catch (e) { console.log('账号控件点击失败 =', e.message.slice(0, 120)); }
    await wait(2500);
    const menuDump = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('div,span,a,li,button').forEach(e => {
        const r = e.getBoundingClientRect();
        const t = (e.innerText || '').trim();
        if (r.width > 0 && r.height > 0 && r.y < 400 && r.x > 900 && t && t.length < 20)
          out.push({ t, x: Math.round(r.x), y: Math.round(r.y), cls: (e.className || '').toString().slice(0, 45) });
      });
      return out.filter((v, i, a) => a.findIndex(z => z.t === v.t && z.x === v.x && z.y === v.y) === i).slice(-40);
    });
    console.log('下拉菜单可见项 =', JSON.stringify(menuDump));
    await page.screenshot({ path: OUT + '\\logout_step2_menu.png' });

    let logoutHit = null;
    for (const label of ['退出登录', '退出', '注销', '安全退出']) {
      const loc = page.getByText(label, { exact: true });
      const n = await loc.count().catch(() => 0);
      if (n) {
        await loc.last().click({ timeout: 8000 }).catch(e => console.log('点击 ' + label + ' 失败 =', e.message.slice(0, 80)));
        logoutHit = label; break;
      }
    }
    if (!logoutHit) logoutHit = (await clickByText(page, '退出登录|退出|注销')) ? 'DOM-click 兜底' : null;
    console.log('点击「退出」= ', logoutHit);
    await wait(8000);
    let after = await probe(page);
    console.log('退出后 URL =', after.url);
    console.log('退出后文本 =', after.body);
    console.log('退出后 cookie =', (await ctx.cookies()).map(c => c.name).join(','));
    await page.screenshot({ path: OUT + '\\logout_step2_after.png' });

    const atLogin = /\/login/.test(after.url) || /请输入用户名|密码|登录/.test(after.body);
    console.log('是否已回到登录页 =', atLogin);
    if (!atLogin) {
      console.log('UI 退出未自动跳登录页，改用 /webroot/decision/logout 兜底');
      try { const rl = await page.goto(BASE + '/logout', { waitUntil: 'commit', timeout: 30000 }); console.log('logout HTTP =', rl && rl.status()); }
      catch (e) { console.log('logout 异常 =', e.message.slice(0, 120)); }
      await wait(3000);
      // 只清应用级 token，保留 IIS/会话层 cookie，避免重新做 NTLM 协商时卡住
      try { await ctx.clearCookies({ name: 'fine_auth_token' }); await ctx.clearCookies({ name: 'fine_remember_login' }); }
      catch (e) { console.log('按名清理不支持 =', e.message.slice(0, 80)); }
      console.log('清理后 cookie =', (await ctx.cookies()).map(c => c.name).join(','));
    }

    // ===== STEP 3 重新点登录 =====
    console.log('=== STEP 3 打开登录页并点登录 ===');
    if (!atLogin) {
      let r3 = null;
      for (let i = 1; i <= 3; i++) {
        try { r3 = await page.goto(LOGIN, { waitUntil: 'commit', timeout: 60000 }); console.log('登录页 HTTP =', r3 && r3.status()); break; }
        catch (e) { console.log('登录页 goto 第 ' + i + ' 次超时，重试 =', e.message.slice(0, 90)); await wait(3000); }
      }
      if (!r3) { console.log('ERR 登录页 3 次均无法打开，放弃'); return; }
    } else { console.log('已在登录页，无需跳转'); }
    let uiReady = false;
    for (let attempt = 1; attempt <= 3 && !uiReady; attempt++) {
      if (attempt > 1) { console.log('登录控件未就绪，重载第 ' + (attempt - 1) + ' 次'); await page.reload({ waitUntil: 'commit', timeout: 40000 }).catch(() => {}); }
      await wait(attempt === 1 ? 35000 : 28000);
      uiReady = await page.evaluate(() => document.querySelectorAll('input').length > 0).catch(() => false);
      if (!uiReady) { await wait(12000); uiReady = await page.evaluate(() => document.querySelectorAll('input').length > 0).catch(() => false); }
    }
    console.log('登录控件就绪 =', uiReady);
    if (!uiReady) { console.log('ERR 登录控件始终未渲染，放弃'); return; }
    console.log('输入框 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ type: i.type, ph: i.placeholder, id: i.id })))));

    const userSel = 'input:not([type=password]):not([type=checkbox]):not([type=hidden])';
    const passSel = 'input[type=password]';
    try { await page.locator(userSel).first().fill(USER, { timeout: 8000 }); console.log('用户名已填'); }
    catch (e) { console.log('用户名 fill 失败，改用 JS 设值 =', await page.evaluate(([s, v]) => { const el = document.querySelector(s); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [userSel, USER])); }
    try { await page.locator(passSel).first().fill(PASS, { timeout: 8000 }); console.log('密码已填'); }
    catch (e) { console.log('密码 fill 失败，改用 JS 设值 =', await page.evaluate(([s, v]) => { const el = document.querySelector(s); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [passSel, PASS])); }
    await wait(800);
    console.log('填后回读 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, len: (i.value || '').length, hasAt: (i.value || '').includes('@') })))));

    const clicked = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, div, span, input[type=button], input[type=submit]')];
      const vis = e => e.getBoundingClientRect().width > 0;
      let hit = els.filter(e => (e.innerText || e.value || '').trim() === '登录' && vis(e));
      if (!hit.length) hit = els.filter(e => /登录|Basic_Login/i.test((e.innerText || e.value || '').trim()) && vis(e) && (e.innerText || '').trim().length < 20);
      const t = hit[hit.length - 1] || hit[0];
      if (t) { t.click(); return t.tagName + '.' + (t.className || '').toString().slice(0, 40); }
      return null;
    });
    console.log('点击「登录」= ', clicked);
    await wait(12000);
    const res = await probe(page);
    console.log('登录后 URL =', res.url);
    console.log('登录后文本 =', res.body);
    console.log('登录后关键字控件 =', JSON.stringify(res.hits));
    console.log('是否强制改密 =', /修改密码|当前密码已失效|请输入旧密码|请再次输入新密码/.test(res.body));
    const cookies = await ctx.cookies();
    console.log('登录后 cookie =', cookies.map(c => c.name).join(','));
    const keep = cookies.filter(c => /fine_auth_token|fine_remember_login|JSESSIONID/i.test(c.name));
    fs.writeFileSync(USER_SESSION, JSON.stringify({ fetchedAt: new Date().toISOString(), user: USER, cookies: keep.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path })) }, null, 2), 'utf8');
    await page.screenshot({ path: OUT + '\\relogin_result.png' });
    console.log('登录结果截图 =', OUT + '\\relogin_result.png');

    if (!/修改密码|当前密码已失效/.test(res.body) && process.env.FR_OPEN_TAB !== '0') {
      console.log('=== STEP 4 打开目标 activeTab ===');
      const r4 = await page.goto(TARGET, { waitUntil: 'commit', timeout: 40000 });
      console.log('目标页 HTTP =', r4 && r4.status());
      await wait(30000);
      console.log('目标页 URL =', page.url());
      console.log('目标页文本 =', (await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 4000))));
      await page.screenshot({ path: OUT + '\\relogin_target.png', fullPage: true });
      console.log('目标页截图 =', OUT + '\\relogin_target.png');
    } else {
      console.log('（仍停在改密界面，未打开目标 Tab）');
      console.log('=== STEP 5 探测改密弹窗左上角「←」返回箭头能否跳过 ===');
      const backCand = await page.evaluate(() => {
        const els = [...document.querySelectorAll('div,span,i,a,button')];
        return els.filter(e => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.width < 70 && r.height < 70 &&
            (/arrow|back|left|return/i.test((e.className || '').toString()) || (e.innerText || '').trim() === '←');
        }).map(e => {
          const r = e.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), cls: (e.className || '').toString().slice(0, 50), text: (e.innerText || '').trim().slice(0, 10) };
        }).slice(0, 12);
      });
      console.log('返回箭头候选 =', JSON.stringify(backCand));
      if (backCand.length) {
        const b = backCand.find(v => v.y > 100 && v.y < 600) || backCand[0];
        await page.mouse.click(b.x, b.y);
        console.log('已真实点击返回箭头 =', JSON.stringify(b));
        await wait(8000);
        const rb = await probe(page);
        console.log('返回后 URL =', rb.url);
        console.log('返回后文本 =', rb.body);
        await page.screenshot({ path: OUT + '\\relogin_back_arrow.png' });
        console.log('返回后截图 =', OUT + '\\relogin_back_arrow.png');
      }
    }
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
