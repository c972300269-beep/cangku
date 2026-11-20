// 用 Windows 域集成认证换到的 fine_auth_token 打开决策平台指定 activeTab
// 改进点：先访问不带 hash 的主页让 SPA 初始化，再切 hash 到目标 Tab（贴近真实操作）
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION = process.env.FR_SESSION || 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
const OUT = 'E:\\workbuddy\\Claw\\reports\\finereport';
const BASE = 'http://10.1.232.246:8089/webroot/decision';
const TAB = process.env.FR_TAB || '9b8028a3-90d7-457a-8824-8d6484cd31d1';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const engine = process.env.FR_ENGINE || 'system';
  const launch = {
    headless: process.env.FR_HEADED !== '1',
    args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246']
  };
  if (engine === 'system') launch.executablePath = EXE;
  console.log('浏览器内核 =', engine);
  const browser = await chromium.launch(launch);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
    await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    const page = await ctx.newPage();
    const bad = [], fails = [], errs = [];
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 170)); });
    page.on('requestfailed', r => fails.push(((r.failure() || {}).errorText || '') + ' ' + r.url().slice(0, 170)));
    page.on('console', m => { if (m.type() === 'error') errs.push((m.text() || '').slice(0, 200)); });
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

    console.log('=== STEP 1 打开主页（不带 hash，白屏自动重载重试）===');
    let homeReady = false;
    const MAX_ROUND = Number(process.env.FR_RETRY || 4);
    for (let round = 1; round <= MAX_ROUND && !homeReady; round++) {
      if (round === 1) {
        const r1 = await page.goto(BASE, { waitUntil: 'commit', timeout: 40000 });
        console.log('HTTP =', r1 && r1.status());
      } else {
        console.log('主页仍是白屏，重载第 ' + (round - 1) + ' 次重试（资源分块传输中断是偶发）');
        await page.reload({ waitUntil: 'commit', timeout: 40000 }).catch(e => console.log('reload 异常 =', e.message.slice(0, 80)));
        bad.length = 0; fails.length = 0; errs.length = 0;
      }
      for (let i = 0; i < 6; i++) {
        await wait(5000);
        const st = await page.evaluate(() => ({ len: (document.body.innerText || '').trim().length, frames: document.querySelectorAll('iframe').length, title: document.title })).catch(() => ({ len: 0, frames: 0, title: '' }));
        console.log('  第' + round + '轮 等待 ' + ((i + 1) * 5) + 's : 文本长度=' + st.len + ' iframe=' + st.frames + ' title=' + st.title);
        if (st.len > 40) { homeReady = true; break; }
      }
      console.log('  第' + round + '轮结束 | 本轮失败请求=' + fails.length + ' >=400=' + bad.length);
      if (fails.length) fails.slice(0, 4).forEach(x => console.log('    FAIL', x));
    }
    console.log('主页渲染成功 =', homeReady);
    if (!homeReady) {
      console.log('ERR 主页 ' + MAX_ROUND + ' 轮重载仍白屏，停止后续动作（诊断见上）');
      return;
    }
    console.log('主页 URL =', page.url());
    console.log('主页文本 =', (await page.evaluate(() => (document.body.innerText || '').slice(0, 800))).replace(/\n+/g, ' | '));
    await page.screenshot({ path: OUT + '\\tab_step1_home.png' });

    console.log('=== STEP 2 切换 hash 到目标 Tab ===');
    await page.evaluate(t => { window.location.hash = '#?activeTab=' + t; }, TAB).catch(e => console.log('hash 切换异常', e.message));
    await wait(25000);
    console.log('Tab URL =', page.url());
    const text = await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 8000));
    console.log('Tab 文本长度 =', text.length);
    console.log('=== Tab 可见文本 ===');
    console.log(text);
    console.log('=== iframe / frames ===');
    for (const f of page.frames()) console.log('  ', f.url().slice(0, 220));

    // iframe 内仪表盘单独等待并取数（主页面 innerText 抓不到跨域同域 iframe 内容）
    console.log('=== STEP 3 等待 iframe 仪表盘渲染 ===');
    for (let i = 0; i < 12; i++) {
      await wait(5000);
      let total = 0;
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        try { total += (await f.evaluate(() => (document.body.innerText || '').trim().length)); } catch (e) {}
      }
      console.log('  等待 ' + ((i + 1) * 5) + 's : iframe 文本合计=' + total);
      if (total > 100) break;
    }
    for (const [idx, f] of page.frames().entries()) {
      if (f === page.mainFrame()) continue;
      console.log('--- frame[' + idx + '] ' + f.url().slice(0, 200) + ' ---');
      try {
        const t = await f.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 12000));
        console.log('  文本长度=' + t.length);
        console.log(t);
        const tbl = await f.evaluate(() => {
          const out = [];
          document.querySelectorAll('table').forEach((tb, k) => {
            const rows = [...tb.querySelectorAll('tr')].slice(0, 30).map(tr => [...tr.querySelectorAll('th,td')].map(td => (td.innerText || '').trim()).join(' | '));
            if (rows.length) out.push('TABLE' + k + ' (' + rows.length + ' 行)\n' + rows.join('\n'));
          });
          return out.slice(0, 6).join('\n---\n').slice(0, 6000);
        });
        if (tbl) { console.log('  === 表格 ==='); console.log(tbl); }
      } catch (e) { console.log('  读取失败:', e.message.slice(0, 120)); }
    }
    await page.screenshot({ path: OUT + '\\tab_step3_dashboard.png', fullPage: true });
    console.log('仪表盘截图 =', OUT + '\\tab_step3_dashboard.png');
    console.log('=== HTML 片段 ===');
    console.log((await page.content()).slice(0, 1200).replace(/\s+/g, ' '));
    await page.screenshot({ path: OUT + '\\tab_step2_target.png', fullPage: true });
    console.log('截图 =', OUT + '\\tab_step2_target.png');

    console.log('=== 失败请求 (>=400) 前 25 ===');
    bad.slice(0, 25).forEach(x => console.log('  ', x));
    console.log('  总计 >=400:', bad.length, '| requestfailed:', fails.length, '| console error:', errs.length);
    fails.slice(0, 10).forEach(x => console.log('  FAIL', x));
    errs.slice(0, 10).forEach(x => console.log('  ERR ', x));
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
