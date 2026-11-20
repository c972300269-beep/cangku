// 直接用已登录的账号会话打开目标 activeTab 对应的仪表盘 iframe 地址（顶层），带资源中断重载重试
// 背景：决策平台 SPA 的 bundle.min.js / dashboard-x.es5.js 偶发 ERR_INCOMPLETE_CHUNKED_ENCODING
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'E:\\workbuddy\\Claw\\reports\\finereport';
const SESSION = process.env.FR_SESSION || 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session_user.json';
const DASH = process.env.FR_DASH || 'http://10.1.232.246:8089/webroot/decision/v10/entry/access/7db7bd29-e2b2-496d-9c5c-e5d16f1b8d36?dashboardType=5&width=1440&height=879';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
    console.log('会话账号 =', s.user, '| 时间 =', s.fetchedAt);
    await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    const page = await ctx.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    let fails = [], bad = [], errs = [];
    page.on('requestfailed', r => fails.push(((r.failure() || {}).errorText || '') + ' ' + r.url().slice(0, 150)));
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 150)); });
    page.on('console', m => { if (m.type() === 'error') errs.push((m.text() || '').slice(0, 160)); });

    let ok = false;
    for (let round = 1; round <= 4 && !ok; round++) {
      if (round === 1) { const r = await page.goto(DASH, { waitUntil: 'commit', timeout: 40000 }); console.log('仪表盘 HTTP =', r && r.status()); }
      else { console.log('重载第 ' + (round - 1) + ' 次'); await page.reload({ waitUntil: 'commit', timeout: 40000 }).catch(e => console.log('reload 异常', e.message.slice(0, 80))); fails = []; bad = []; errs = []; }
      for (let i = 0; i < 5; i++) {
        await wait(5000);
        const st = await page.evaluate(() => ({
          len: (document.body.innerText || '').trim().length,
          nodes: document.querySelectorAll('*').length,
          canvas: document.querySelectorAll('canvas').length,
          svg: document.querySelectorAll('svg').length,
          tables: document.querySelectorAll('table').length
        })).catch(() => ({ len: 0, nodes: 0, canvas: 0, svg: 0, tables: 0 }));
        console.log('  第' + round + '轮 ' + ((i + 1) * 5) + 's : 文本=' + st.len + ' 节点=' + st.nodes + ' canvas=' + st.canvas + ' svg=' + st.svg + ' table=' + st.tables);
        if (st.nodes > 300 || st.len > 100) { ok = true; break; }
      }
      console.log('  第' + round + '轮失败请求=' + fails.length + ' >=400=' + bad.length);
      fails.slice(0, 3).forEach(x => console.log('    FAIL', x));
    }
    console.log('仪表盘渲染成功 =', ok);
    console.log('最终 URL =', page.url());
    console.log('=== 可见文本 ===');
    console.log((await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 8000))));
    console.log('=== 表格 ===');
    console.log((await page.evaluate(() => [...document.querySelectorAll('table')].slice(0, 8).map(tb => [...tb.querySelectorAll('tr')].slice(0, 25).map(tr => [...tr.querySelectorAll('th,td')].map(td => (td.innerText || '').trim()).join(' | ')).join('\n')).join('\n---\n').slice(0, 6000))));
    try { await page.screenshot({ path: OUT + '\\dashboard_direct.png', fullPage: true, timeout: 25000 }); console.log('截图 =', OUT + '\\dashboard_direct.png'); }
    catch (e) { console.log('截图跳过 =', e.message.slice(0, 90)); }
    console.log('=== 失败请求 / 控制台错误 ===');
    fails.slice(0, 8).forEach(x => console.log('  FAIL', x));
    bad.slice(0, 8).forEach(x => console.log('  HTTP', x));
    errs.slice(0, 8).forEach(x => console.log('  ERR ', x));
    console.log('  合计 requestfailed=' + fails.length + ' >=400=' + bad.length + ' console error=' + errs.length);
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
