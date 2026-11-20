// 探索时代邻里数据分析平台「数据目录」里的家庭消费系列报表与导出入口
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'E:\\workbuddy\\Claw\\reports\\finereport';
const SESSION = process.env.FR_SESSION || 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session_user.json';
const DASH = process.env.FR_DASH || 'http://10.1.232.246:8089/webroot/decision/v10/entry/access/7db7bd29-e2b2-496d-9c5c-e5d16f1b8d36?dashboardType=5&width=1440&height=879';

async function dump(page, tag) {
  const d = await page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const txt = e => (e.innerText || e.value || e.placeholder || e.title || '').trim();
    const items = [...document.querySelectorAll('a,button,div,span,li,td,input')]
      .filter(e => vis(e))
      .map(e => ({ tag: e.tagName, t: txt(e).slice(0, 40), cls: (e.className || '').toString().slice(0, 42), href: e.getAttribute('href') || '' }))
      .filter(v => v.t && v.t.length < 40)
      .filter((v, i, a) => a.findIndex(z => z.t === v.t && z.cls === v.cls) === i);
    return {
      url: location.href, title: document.title,
      body: (document.body.innerText || '').replace(/\n{2,}/g, ' | ').slice(0, 3000),
      items: items.slice(-90),
      links: [...document.querySelectorAll('a[href]')].map(a => ({ t: txt(a).slice(0, 40), h: a.getAttribute('href') })).slice(-40)
    };
  }).catch(e => ({ err: e.message }));
  console.log('\n===== ' + tag + ' =====');
  console.log('URL =', d.url);
  console.log('文本 =', d.body);
  console.log('可见控件 =', JSON.stringify(d.items || []));
  console.log('链接 =', JSON.stringify(d.links || []));
  return d;
}

async function clickText(page, label) {
  const loc = page.getByText(label, { exact: true });
  const n = await loc.count().catch(() => 0);
  if (!n) { console.log('未找到可点文字:', label); return false; }
  await loc.last().click({ timeout: 8000 }).catch(e => console.log('点击 ' + label + ' 失败 =', e.message.slice(0, 90)));
  console.log('已点击:', label);
  await wait(9000);
  return true;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true, acceptDownloads: true });
    const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    const page = await ctx.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    const downloads = [];
    page.on('download', dl => downloads.push(dl.suggestedFilename()));
    let fails = [];
    page.on('requestfailed', r => fails.push(((r.failure() || {}).errorText || '') + ' ' + r.url().slice(0, 110)));

    // 会话约半小时失效，顶层打开仪表盘会跳 SSO 401；每次先重新登录刷新 cookie
    if (process.env.FR_PASS) {
      console.log('=== 重新登录刷新会话 ===');
      try {
        await page.goto('http://10.1.232.246:8089/webroot/decision/login', { waitUntil: 'commit', timeout: 60000 });
        await page.waitForSelector('input[type=password]', { timeout: 60000 });
        await page.locator('input:not([type=password]):not([type=checkbox]):not([type=hidden])').first().fill(process.env.FR_USER || 'yaoshiyun1', { timeout: 10000 });
        await page.locator('input[type=password]').first().fill(process.env.FR_PASS, { timeout: 10000 });
        await page.evaluate(() => {
          const els = [...document.querySelectorAll('button,a,div,span')];
          const t = els.filter(e => e.getBoundingClientRect().width > 0 && /^(登录|Dec-Basic_Login)$/.test((e.innerText || '').trim())).pop();
          if (t) t.click();
        });
        await wait(12000);
        console.log('登录后 URL =', page.url());
        const ck = await ctx.cookies();
        const keep = ck.filter(c => /fine_auth_token|fine_remember_login|JSESSIONID|tenantId|io|sessionID/i.test(c.name));
        fs.writeFileSync(SESSION, JSON.stringify({ fetchedAt: new Date().toISOString(), user: process.env.FR_USER || 'yaoshiyun1', cookies: keep.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path })) }, null, 2), 'utf8');
        console.log('已刷新会话 cookie =', keep.map(c => c.name).join(','));
      } catch (e) { console.log('登录刷新异常 =', e.message.slice(0, 120)); }
    }

    let ok = false;
    for (let round = 1; round <= 4 && !ok; round++) {
      if (round === 1) { const r = await page.goto(DASH, { waitUntil: 'commit', timeout: 40000 }); console.log('数据目录 HTTP =', r && r.status()); }
      else { console.log('重载第 ' + (round - 1) + ' 次'); await page.reload({ waitUntil: 'commit', timeout: 40000 }).catch(() => {}); fails = []; }
      for (let i = 0; i < 5; i++) {
        await wait(5000);
        const n = await page.evaluate(() => document.querySelectorAll('*').length).catch(() => 0);
        console.log('  第' + round + '轮 ' + ((i + 1) * 5) + 's : 节点=' + n);
        if (n > 300) { ok = true; break; }
      }
    }
    console.log('数据目录渲染成功 =', ok);
    await dump(page, 'STEP1 数据目录首页');
    try { await page.screenshot({ path: OUT + '\\explore_step1.png', timeout: 20000 }); } catch (e) {}

    if (await clickText(page, '应用报表')) {
      await dump(page, 'STEP2 应用报表');
      try { await page.screenshot({ path: OUT + '\\explore_step2_apps.png', timeout: 20000 }); } catch (e) {}
    }
    if (await clickText(page, '指标数据')) {
      await dump(page, 'STEP3 指标数据');
      try { await page.screenshot({ path: OUT + '\\explore_step3_kpi.png', timeout: 20000 }); } catch (e) {}
    }
    console.log('\n=== 含「家庭消费 / 导出 / 下载 / 目标」字样的可见控件 ===');
    const hits = await page.evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const txt = e => (e.innerText || e.value || e.placeholder || e.title || '').trim();
      return [...document.querySelectorAll('a,button,div,span,li,td,input')]
        .filter(e => vis(e) && /家庭消费|导出|下载|目标|excel|Excel/.test(txt(e)))
        .map(e => ({ tag: e.tagName, t: txt(e).slice(0, 50), cls: (e.className || '').toString().slice(0, 42) }))
        .filter((v, i, a) => a.findIndex(z => z.t === v.t) === i).slice(-60);
    }).catch(() => []);
    console.log(JSON.stringify(hits));
    console.log('下载事件 =', JSON.stringify(downloads));
    console.log('失败请求 =', fails.length);
    fails.slice(0, 6).forEach(x => console.log('  FAIL', x));
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
