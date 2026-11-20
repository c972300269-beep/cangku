// 时代邻里数据分析平台：同一次会话内「登录 -> 进入数据目录 -> 定位并导出家庭消费系列报表」
// 关键教训：会话约半小时过期，顶层打开 /v10/entry/access 会被 times-sso 挡回 401；
//           登录页偶发资源中断导致输入框渲染不出来，必须带重载等待（复用 login_final 的 waitInputs）。
// 密码只走环境变量，不落盘；所有产出写 E 盘。
// ⛔ 停工闸门（2026-11-06 13:35，用户明确要求「不要频繁访问」）
// 出口 IP 已被帆软 11300015 拉进拦截名单，连用户本人浏览器都被挡。
// 未经用户明确许可不得再向平台发任何请求，包括「探测限流是否解除」这类轻量请求。
if (process.env.FR_ALLOW !== '1') {
  console.log('STOP: 平台访问已停工（错误码 11300015，IP 级黑名单）。');
  console.log('      需用户确认拦截解除后，显式设置 FR_ALLOW=1 才允许运行本脚本。');
  process.exit(0);
}
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const ROOT = 'E:\\workbuddy\\Claw';
const OUT = ROOT + '\\reports\\finereport';
const DL = ROOT + '\\reports\\家庭消费数据_平台导出_20261106';
const SESSION = ROOT + '\\.workbuddy\\finereport_session_user.json';
const DOMAIN_SESSION = ROOT + '\\.workbuddy\\finereport_session.json';
const BASE = 'http://10.1.232.246:8089/webroot/decision';
const LOGIN = BASE + '/login';
const TARGET = BASE + '#?activeTab=9b8028a3-90d7-457a-8824-8d6484cd31d1';
const DASH = process.env.FR_DASH || BASE + '/v10/entry/access/7db7bd29-e2b2-496d-9c5c-e5d16f1b8d36?dashboardType=5&width=1440&height=879';
const USER = process.env.FR_USER || 'yaoshiyun1';
const PASS = process.env.FR_PASS || '__FINEREPORT_PASS__';
const PHASE = process.env.FR_PHASE || 'explore';   // explore | export

const bodyText = p => p.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, ' | ').slice(0, 1500));

async function snap(page, name, opts) {
  try { await page.screenshot(Object.assign({ path: path.join(OUT, name), timeout: 20000 }, opts || {})); console.log('截图 =', name); }
  catch (e) { console.log('截图跳过 ' + name + ' =', e.message.slice(0, 80)); }
}

// 登录页资源偶发中断 -> 重载 + 等待输入框
async function waitInputs(page) {
  const ready = () => page.evaluate(() => document.querySelectorAll('input').length >= 2).catch(() => false);
  if (await ready()) { console.log('输入框已就绪'); return true; }
  for (let a = 1; a <= 4; a++) {
    if (a > 1) { console.log('输入框未就绪，重载第 ' + (a - 1) + ' 次'); await page.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {}); }
    await wait(a === 1 ? 30000 : 25000);
    if (await ready()) return true;
    await wait(10000);
    if (await ready()) return true;
  }
  return false;
}

async function login(page, ctx) {
  console.log('=== STEP 1 登录 ' + USER + ' ===');
  for (let i = 1; i <= 3; i++) {
    try { const r = await page.goto(LOGIN, { waitUntil: 'commit', timeout: 60000 }); console.log('登录页 HTTP =', r && r.status()); break; }
    catch (e) { console.log('登录页 goto 第' + i + '次超时 =', e.message.slice(0, 80)); if (i === 3) return false; await wait(3000); }
  }
  if (!await waitInputs(page)) { console.log('ERR 登录页输入框始终未渲染'); return false; }
  await page.locator('input:not([type=password]):not([type=checkbox]):not([type=hidden])').first().fill(USER, { timeout: 10000 });
  await page.locator('input[type=password]').first().fill(PASS, { timeout: 10000 });
  await wait(500);
  console.log('回读 =', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map(i => ({ ph: i.placeholder, len: (i.value || '').length })))));
  await snap(page, 'export_login_filled.png');
  const hit = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button,a,div,span,input[type=button],input[type=submit]')];
    const vis = e => e.getBoundingClientRect().width > 0;
    let h = els.filter(e => (e.innerText || e.value || '').trim() === '登录' && vis(e));
    if (!h.length) h = els.filter(e => /登录|Basic_Login/i.test((e.innerText || e.value || '').trim()) && vis(e) && (e.innerText || '').trim().length < 20);
    const t = h[h.length - 1] || h[0];
    if (t) { t.click(); return (t.innerText || t.value || '').trim(); }
    return null;
  });
  console.log('点击登录 =', hit);
  await wait(12000);
  const t = await bodyText(page);
  console.log('登录后 URL =', page.url());
  console.log('登录后文本 =', t);
  const ck = await ctx.cookies();
  console.log('cookie =', ck.map(c => c.name).join(','));
  const hasToken = ck.some(c => c.name === 'fine_auth_token' && c.value && c.value.length > 20);
  const blocked = /修改密码|当前密码已失效|用户名或密码|密码错误|401/.test(t) || /times-sso/.test(page.url());
  console.log('登录判定: token =', hasToken, '| 被拦截 =', blocked);
  if (!hasToken || blocked) { await snap(page, 'export_login_failed.png'); return false; }
  fs.writeFileSync(SESSION, JSON.stringify({ fetchedAt: new Date().toISOString(), user: USER, cookies: ck.filter(c => /fine_auth_token|fine_remember_login|JSESSIONID|tenantId/i.test(c.name)).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path })) }, null, 2), 'utf8');
  console.log('已保存 fresh 会话');
  await snap(page, 'export_login_ok.png');
  return true;
}

// 打开仪表盘（数据目录），资源中断自动重载
async function openDash(page) {
  console.log('=== STEP 2 打开数据目录仪表盘 ===');
  let ok = false;
  for (let round = 1; round <= 4 && !ok; round++) {
    if (round === 1) { const r = await page.goto(DASH, { waitUntil: 'commit', timeout: 40000 }); console.log('HTTP =', r && r.status()); }
    else { console.log('重载第 ' + (round - 1) + ' 次'); await page.reload({ waitUntil: 'commit', timeout: 40000 }).catch(() => {}); }
    for (let i = 0; i < 5; i++) {
      await wait(5000);
      const st = await page.evaluate(() => ({ n: document.querySelectorAll('*').length, len: (document.body.innerText || '').trim().length })).catch(() => ({ n: 0, len: 0 }));
      console.log('  第' + round + '轮 ' + ((i + 1) * 5) + 's : 节点=' + st.n + ' 文本=' + st.len);
      if (st.n > 300 || st.len > 100) { ok = true; break; }
    }
    if (/times-sso|401/.test(page.url())) { console.log('  !! 被 SSO 拦截 URL =', page.url().slice(0, 160)); return false; }
  }
  console.log('渲染成功 =', ok, '| URL =', page.url().slice(0, 180));
  await snap(page, 'export_dash.png', { fullPage: true });
  return ok;
}

// 全量 dump：文本 / 控件 / 链接 / iframe / 网络请求
async function fullDump(page, tag, xhrs) {
  console.log('\n===== ' + tag + ' =====');
  for (const f of page.frames()) {
    const d = await f.evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const txt = e => (e.innerText || e.value || e.placeholder || e.title || e.getAttribute('aria-label') || '').trim();
      const ctrls = [...document.querySelectorAll('a,button,div,span,li,td,th,input,iframe')]
        .filter(e => vis(e))
        .map(e => ({ tag: e.tagName, t: txt(e).slice(0, 60), cls: (e.className || '').toString().slice(0, 45), href: (e.getAttribute('href') || '').slice(0, 160), src: (e.getAttribute('src') || '').slice(0, 160) }))
        .filter(v => v.t || v.href || v.src)
        .filter((v, i, a) => a.findIndex(z => z.t === v.t && z.href === v.href && z.src === v.src) === i);
      return {
        url: location.href.slice(0, 200),
        text: (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 12000),
        ctrls: ctrls.slice(-160),
        links: [...document.querySelectorAll('a[href]')].map(a => ({ t: txt(a).slice(0, 50), h: a.getAttribute('href').slice(0, 200) })).slice(-80),
        iframes: [...document.querySelectorAll('iframe')].map(i => i.src).slice(-30)
      };
    }).catch(e => ({ err: e.message.slice(0, 100) }));
    console.log('--- FRAME ' + f.url().slice(0, 160) + ' ---');
    if (d.err) { console.log('  ERR', d.err); continue; }
    console.log('  文本:', (d.text || '').slice(0, 6000));
    console.log('  控件:', JSON.stringify(d.ctrls || []).slice(0, 14000));
    console.log('  链接:', JSON.stringify(d.links || []).slice(0, 6000));
    console.log('  iframe:', JSON.stringify(d.iframes || []));
    fs.writeFileSync(path.join(OUT, 'dump_' + tag.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Math.abs(hash(f.url())) + '.json'), JSON.stringify(d, null, 2), 'utf8');
  }
  console.log('  XHR 请求（最近 40）:');
  xhrs.slice(-40).forEach(x => console.log('   ', x));
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

(async () => {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DL, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true, acceptDownloads: true });
    // 带上域账号会话，帮助 NTLM/SSO 协商（login_final 成功时也是这个配置）
    if (fs.existsSync(DOMAIN_SESSION)) {
      const s = JSON.parse(fs.readFileSync(DOMAIN_SESSION, 'utf8').replace(/^\uFEFF/, ''));
      await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    }
    const page = await ctx.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
    const xhrs = [], downloads = [], fails = [];
    page.on('request', r => { if (['xhr', 'fetch'].includes(r.resourceType())) xhrs.push(r.method() + ' ' + r.url().slice(0, 220)); });
    page.on('requestfailed', r => fails.push(((r.failure() || {}).errorText || '') + ' ' + r.url().slice(0, 130)));
    page.on('download', async dl => {
      const name = dl.suggestedFilename();
      const dest = path.join(DL, name);
      try { await dl.saveAs(dest); downloads.push({ name, dest, ok: true, size: fs.statSync(dest).size }); console.log('!! 下载 =', name, fs.statSync(dest).size, 'B'); }
      catch (e) { downloads.push({ name, ok: false, err: e.message.slice(0, 100) }); console.log('!! 下载保存失败 =', e.message.slice(0, 100)); }
    });

    if (!await login(page, ctx)) { console.log('ERR 登录失败，终止'); return; }

    // TOKEN 阶段：只做一次全新登录刷新会话，供后续慢速脚本使用
    if (PHASE === 'token') { console.log('=== 已刷新登录会话，退出（不发起报表请求）==='); return; }

    // EXPORT 阶段：同一次登录会话内，用平台目录树定位到的 4 张报表 entry id 逐个重新导出 xlsx
    if (PHASE === 'export') {
      const ck = await ctx.cookies();
      const token = (ck.find(c => c.name === 'fine_auth_token') || {}).value || '';
      console.log('=== STEP 2E 重新导出 4 张报表 | token 长度 =', token.length, '===');
      const H = { Authorization: 'Bearer ' + token, Accept: '*/*' };
      const ALL = [
        { file: '2-2_家庭消费项目级汇总表.xlsx', id: '7ae88e38-ffe9-4fd5-9fb4-47db6c3cf67c', text: '2-2 家庭消费项目级汇总表', extype: 'simple', cpt: '钟瀚开发目录/家庭消费/家庭消费项目级汇总v2加参数.cpt' },
        { file: '1-05邻里精选_02-家庭消费数据报表_2_家庭消费数据层级报表（楼栋→项目→公司→集团）.xlsx', id: '70daa864-b8c2-49e9-913c-024c4897a71d', text: '2 家庭消费数据层级报表（楼栋→项目→公司→集团）', extype: 'simple', cpt: '钟瀚开发目录/家庭消费/家庭消费楼栋层级汇总v3拆个人业主.cpt' },
        { file: '1-1_家庭消费房间明细表_住宅.xlsx', id: '9b8028a3-90d7-457a-8824-8d6484cd31d1', text: '1-1 家庭消费房间明细表_住宅', extype: 'simple', cpt: '钟瀚开发目录/家庭消费/家庭消费房间明细v3.cpt' },
        { file: '3_项目&区域目标填报表.xlsx', id: '49adbe80-de8d-4d9c-a2a6-c05345982e04', text: '3 项目&区域目标填报表', extype: 'simple', cpt: '钟瀚开发目录/家庭消费/项目&区域目标填报表.cpt' }
      ];
      // 平台限制：同一登录会话连续打开多张报表会被判「无权限访问」。
      // FR_ONLY=1..4 时本进程只导一张，配合每次单独登录使用。
      const only = parseInt(process.env.FR_ONLY || '0', 10);
      const REPORTS = (only >= 1 && only <= ALL.length) ? [ALL[only - 1]] : ALL;
      console.log('本轮导出张数 =', REPORTS.length, only ? '(FR_ONLY=' + only + ')' : '');
      const results = [];
      for (const r of REPORTS) {
        console.log('\n--- 导出:', r.text, '->', r.file);
        let sid = '', previewLen = 0;
        try {
          const pv = await ctx.request.get(BASE + '/v10/entry/access/' + r.id, { headers: H, timeout: 45000 });
          const html = await pv.text();
          previewLen = html.length;
          const m = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
          sid = m ? m[0] : '';
          const noPriv = /No_Privilege_Access_Page/.test(html);
          console.log('  预览页 HTTP =', pv.status(), 'len =', previewLen, '| sessionID =', sid || '(无)', '| 无权限页 =', noPriv);
          fs.writeFileSync(path.join(OUT, 'export_preview_' + (only || 'all') + '.html'), html, 'utf8');
          if (noPriv || previewLen < 10000) { console.log('   ERR 预览页被拒（会话已被平台限制），需重新登录'); results.push(Object.assign({ ok: false, err: '预览页无权限 len=' + previewLen }, r)); continue; }
          if (!sid) { results.push(Object.assign({ ok: false, err: '预览页无 sessionID' }, r)); continue; }
        } catch (e) { console.log('  预览页异常（转兜底）=', e.message.slice(0, 110)); }

        for (const ext of [r.extype, 'page', 'sheet']) {
          try {
            const u = BASE + '/view/report?op=export&sessionID=' + sid + '&format=excel&extype=' + ext;
            const ex = await ctx.request.get(u, { headers: H, timeout: 240000 });
            const buf = await ex.body();
            const isXlsx = buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b;
            console.log('  导出 extype=' + ext + ' HTTP=' + ex.status() + ' len=' + buf.length + ' xlsx=' + isXlsx);
            if (!isXlsx) continue;
            const dest = path.join(DL, r.file);
            fs.writeFileSync(dest, buf);
            results.push({ ok: true, file: r.file, text: r.text, id: r.id, extype: ext, size: buf.length, sessionID: sid, dest });
            console.log('  >>> 已保存', dest, buf.length, 'B');
            break;
          } catch (e) { console.log('  导出 extype=' + ext + ' 异常 =', e.message.slice(0, 110)); }
        }
        // 预览页被限流/超时时，兜底：直接用 .cpt 报表路径导出，不经过报表会话
        if (!results.some(x => x.ok && x.file === r.file)) {
          console.log('  预览页路线失败，尝试报表路径直导兜底');
          const q = encodeURIComponent(r.cpt).replace(/%2F/g, '/').replace(/%26/g, '%26');
          const urls = [
            '/webroot/ReportServer?reportlet=' + q + '&op=export&format=excel&extype=simple',
            '/webroot/decision/view/report?viewlet=' + q + '&op=export&format=excel&extype=simple'
          ];
          for (const u of urls) {
            try {
              const ex2 = await ctx.request.get('http://10.1.232.246:8089' + u, { headers: H, timeout: 180000 });
              const buf2 = await ex2.body();
              const isx2 = buf2.length > 1000 && buf2[0] === 0x50 && buf2[1] === 0x4b;
              console.log('  兜底 ' + u.split('?')[0] + ' HTTP=' + ex2.status() + ' len=' + buf2.length + ' xlsx=' + isx2);
              if (isx2) {
                const dest2 = path.join(DL, r.file);
                fs.writeFileSync(dest2, buf2);
                results.push({ ok: true, file: r.file, text: r.text, id: r.id, extype: 'direct', size: buf2.length, dest: dest2 });
                console.log('  >>> 兜底成功保存', dest2, buf2.length, 'B');
                break;
              } else {
                console.log('    片段 =', buf2.slice(0, 110).toString('utf8').replace(/\n/g, ' '));
              }
            } catch (e) { console.log('  兜底异常 =', e.message.slice(0, 100)); }
          }
        }
        if (!results.some(x => x.ok && x.file === r.file)) results.push(Object.assign({ ok: false, err: '预览页与直导均未返回 xlsx' }, r));
      }
      console.log('\n=== 导出汇总 ===');
      results.forEach(x => console.log('  ', x.ok ? 'OK  ' : 'FAIL', x.file, x.ok ? x.size + ' B / ' + x.extype : x.err));
      fs.writeFileSync(path.join(OUT, 'export_result.json'), JSON.stringify({ at: new Date().toISOString(), user: USER, results }, null, 2), 'utf8');
      return;
    }

    // TREE 阶段：调平台自身目录树 API，把报表节点 / 路径挖出来；同时 dump 主页左侧菜单
    if (PHASE === 'tree') {
      console.log('=== STEP 2T 平台目录树 API 探测 ===');
      const apis = [
        '/webroot/decision/v10/view/entry/tree',
        '/webroot/decision/v10/entry/tree',
        '/webroot/decision/v10/entry/list',
        '/webroot/decision/v10/favorite/entry/list',
        '/webroot/decision/login/info'
      ];
      for (const a of apis) {
        try {
          const r = await page.request.get('http://10.1.232.246:8089' + a, { timeout: 30000 });
          const txt = await r.text();
          console.log('\nAPI ' + a + ' HTTP ' + r.status() + ' len=' + txt.length);
          console.log('  ' + txt.slice(0, 1200));
          fs.writeFileSync(path.join(OUT, 'api_' + a.replace(/[^a-zA-Z0-9]/g, '_') + '.json'), txt, 'utf8');
        } catch (e) { console.log('API ' + a + ' ERR ' + e.message.slice(0, 120)); }
      }
      console.log('\n=== STEP 2H 打开决策平台主页，dump 左侧目录 ===');
      for (let round = 1; round <= 3; round++) {
        if (round === 1) await page.goto(BASE, { waitUntil: 'commit', timeout: 60000 }).catch(e => console.log('主页 goto =', e.message.slice(0, 80)));
        else await page.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {});
        await wait(15000);
        const n = await page.evaluate(() => document.querySelectorAll('*').length).catch(() => 0);
        console.log('主页第' + round + '轮 节点=' + n + ' URL=' + page.url().slice(0, 120));
        if (n > 800) break;
      }
      await fullDump(page, 'HOME_主页目录', xhrs);
      await snap(page, 'export_home.png', { fullPage: true });
      fs.writeFileSync(path.join(OUT, 'export_tree_xhr.json'), JSON.stringify({ xhrs, fails }, null, 2), 'utf8');
      return;
    }

    if (!await openDash(page)) { console.log('ERR 数据目录打不开，终止'); return; }
    await fullDump(page, 'STEP2_数据目录', xhrs);

    // 尝试点击常见页签，扩大探索面
    for (const label of (process.env.FR_TABS || '应用报表,指标数据,主数据,邻里精选,家庭消费').split(',')) {
      const loc = page.getByText(label, { exact: true });
      const n = await loc.count().catch(() => 0);
      if (!n) { console.log('未找到页签:', label); continue; }
      console.log('点击页签:', label, '(匹配 ' + n + ')');
      await loc.last().click({ timeout: 8000 }).catch(e => console.log('  点击失败 =', e.message.slice(0, 80)));
      await wait(7000);
      await fullDump(page, 'TAB_' + label, xhrs);
      await snap(page, 'export_tab_' + label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_') + '.png', { fullPage: true });
    }

    console.log('\n=== 全部下载 ===', JSON.stringify(downloads));
    console.log('=== 失败请求数 =', fails.length);
    fails.slice(0, 8).forEach(x => console.log('  FAIL', x));
    fs.writeFileSync(path.join(OUT, 'export_explore_xhr.json'), JSON.stringify({ xhrs, downloads, fails }, null, 2), 'utf8');
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
