// 用指定账号登录「时代邻里数据分析平台」(FineReport 11) 并打开指定 activeTab
// 账号密码从环境变量传入，不落盘到脚本；会话凭证写入 E 盘供后续复用
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
const USER_SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session_user.json';
const OUT = 'E:\\workbuddy\\Claw\\reports\\finereport';
const LOGIN = 'http://10.1.232.246:8089/webroot/decision/login';
const TARGET = process.argv[2] || 'http://10.1.232.246:8089/webroot/decision#?activeTab=9b8028a3-90d7-457a-8824-8d6484cd31d1';
const USER = process.env.FR_USER || '';
const PASS = process.env.FR_PASS || '';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!USER || !PASS) { console.log('ERR 缺少 FR_USER / FR_PASS'); process.exit(2); }
  // 实测：系统 Chrome 内核常因 ERR_INCOMPLETE_CHUNKED_ENCODING 白屏，bundled 内核稳定
  const engine = process.env.FR_ENGINE || 'bundled';
  const launch = {
    headless: true,
    args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246']
  };
  if (engine === 'system') launch.executablePath = EXE;
  console.log('浏览器内核 =', engine);
  const browser = await chromium.launch(launch);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    // 先用 Windows 集成认证换到的 cookie 过 IIS 层，保证静态资源能加载
    if (fs.existsSync(SESSION)) {
      const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
      await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    }
    const page = await ctx.newPage();
    page.on('response', async r => {
      if (r.request().method() === 'POST' && /\/login(\?|$)/.test(r.url())) {
        try { console.log('登录响应 =', (await r.text()).slice(0, 300)); } catch (e) {}
      }
    });
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

    console.log('打开登录页...');
    const r = await page.goto(LOGIN, { waitUntil: 'commit', timeout: 40000 });
    console.log('登录页 HTTP =', r && r.status());
    // 实测：前端需约 35s 才挂载完，且偶发资源传输中断导致白屏 -> 重载重试
    let uiReady = false;
    for (let attempt = 1; attempt <= 3 && !uiReady; attempt++) {
      if (attempt > 1) {
        console.log('登录页未就绪，重载第 ' + (attempt - 1) + ' 次...');
        await page.reload({ waitUntil: 'commit', timeout: 40000 }).catch(() => {});
      }
      await wait(attempt === 1 ? 35000 : 28000);
      uiReady = await page.evaluate(() => document.querySelectorAll('input').length > 0).catch(() => false);
      if (!uiReady) { await wait(14000); uiReady = await page.evaluate(() => document.querySelectorAll('input').length > 0).catch(() => false); }
    }
    console.log('控件就绪 =', uiReady);
    if (!uiReady) { console.log('ERR 登录控件始终未渲染，放弃本次登录'); return; }

    const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, id: i.id, ph: i.placeholder, cls: (i.className || '').slice(0, 60)
    })));
    console.log('输入框:', JSON.stringify(inputs));

    // 填用户名/密码：优先用 placeholder，再退回 type
    const userSel = 'input:not([type=password]):not([type=checkbox]):not([type=hidden])';
    const passSel = 'input[type=password]';
    try {
      await page.locator(userSel).first().fill(USER, { timeout: 8000 });
      console.log('用户名已填 (locator.fill)');
    } catch (e) {
      const ok = await page.evaluate(([sel, v]) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, [userSel, USER]);
      console.log('用户名 JS 设值 =', ok);
    }
    try {
      await page.locator(passSel).first().fill(PASS, { timeout: 8000 });
      console.log('密码已填 (locator.fill)');
    } catch (e) {
      const ok = await page.evaluate(([sel, v]) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, [passSel, PASS]);
      console.log('密码 JS 设值 =', ok);
    }
    await wait(800);

    // 填后回读：确认末尾特殊字符没被截断（不打印密码明文）
    const verify = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({
      ph: i.placeholder, len: (i.value || '').length,
      hasAt: (i.value || '').includes('@'), endsWithDot: (i.value || '').endsWith('.'),
      maxLength: i.maxLength
    })));
    console.log('填后回读 =', JSON.stringify(verify));

    // 点「登录」按钮
    const clicked = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, div, span, input[type=button], input[type=submit]')];
      const vis = e => e.getBoundingClientRect().width > 0;
      const short = e => (e.innerText || e.value || '').trim().length < 20;
      let hit = els.filter(e => (e.innerText || e.value || '').trim() === '登录' && vis(e) && short(e));
      if (!hit.length) hit = els.filter(e => (e.innerText || e.value || '').trim() === 'Dec-Basic_Login' && vis(e) && short(e));
      if (!hit.length) hit = els.filter(e => /登录|Basic_Login/i.test((e.innerText || e.value || '').trim()) && vis(e) && short(e));
      const t = hit[hit.length - 1] || hit[0];
      if (t) { t.click(); return t.tagName + '.' + (t.className || '').toString().slice(0, 40); }
      return null;
    });
    console.log('点击登录 =', clicked);
    await wait(12000);
    console.log('登录后 URL =', page.url());
    console.log('登录后文本 =', (await page.evaluate(() => (document.body.innerText || '').slice(0, 500))).replace(/\n+/g, ' | '));
    // 保存登录后的 cookie（即使只验证登录也保存，便于后续以该账号身份复用）
    const cookies = await ctx.cookies();
    const keep = cookies.filter(c => /fine_auth_token|fine_remember_login|JSESSIONID/i.test(c.name));
    fs.writeFileSync(USER_SESSION, JSON.stringify({
      fetchedAt: new Date().toISOString(), user: USER, cookies: keep.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path }))
    }, null, 2), 'utf8');
    console.log('已保存会话凭证:', keep.map(c => c.name).join(','));
    if (process.env.FR_DUMP_DOM === '1') {
      const dom = await page.evaluate(() => ({
        labels: [...document.querySelectorAll('button,a,div,span,input')]
          .filter(e => e.getBoundingClientRect().width > 0)
          .map(e => (e.innerText || e.value || e.placeholder || '').trim())
          .filter(s => s && s.length < 24).filter((s, i, a) => a.indexOf(s) === i).slice(-35),
        inputs: [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, type: i.type })),
        dialogHtml: (document.querySelector('.bi-dialog, .bi-popup, [class*=dialog], [class*=modal]') || document.body).innerHTML.slice(-1800)
      }));
      console.log('=== 弹窗可见文案 ===');
      console.log(JSON.stringify(dom.labels));
      console.log('=== 输入框 ===');
      console.log(JSON.stringify(dom.inputs));
      console.log('=== 弹窗 HTML 片段 ===');
      console.log(dom.dialogHtml.replace(/\s+/g, ' ').slice(0, 1600));
      await page.screenshot({ path: OUT + '\\chpwd_dialog.png' });
      console.log('弹窗截图 =', OUT + '\\chpwd_dialog.png');
    }
    if (process.env.FR_LOGIN_ONLY === '1') { console.log('（仅验证登录，跳过目标页）'); return; }

    // 打开目标 Tab
    console.log('打开目标 Tab...');
    const r2 = await page.goto(TARGET, { waitUntil: 'commit', timeout: 40000 });
    console.log('目标页 HTTP =', r2 && r2.status());
    // 决策平台主 SPA 同样加载慢，静置等待后取文本
    await wait(40000);
    console.log('目标页文本长度 =', await page.evaluate(() => (document.body.innerText || '').trim().length));
    console.log('目标页 URL =', page.url());
    console.log('目标页标题 =', await page.title());
    console.log('=== 目标页可见文本 ===');
    console.log((await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 6000))));
    console.log('=== iframe ===');
    for (const f of page.frames()) console.log('  ', f.url().slice(0, 200));
    await page.screenshot({ path: OUT + '\\logged_target.png' });
    console.log('截图 =', OUT + '\\logged_target.png');
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
