const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(msg); }
const SN = 'REQ202608300118';

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox','--auth-server-allowlist=bpm.timesgroup.cn','--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const page = await (await b.newContext({ viewport:{width:1920,height:1080}, ignoreHTTPSErrors:true })).newPage();
  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(12000);

  // 候选待办列表页
  const candidates = [
    'http://bpm.timesgroup.cn/BPM2018/Workflow/TaskList.aspx',
    'http://bpm.timesgroup.cn/YZSoft/BPM/TaskList.aspx'
  ];
  let ok=false;
  for (const u of candidates) {
    log('尝试: ' + u);
    try {
      await page.goto(u, { waitUntil:'domcontentloaded', timeout:20000 });
      await wait(8000);
      const title = await page.title();
      const hasGrid = await page.evaluate(() => document.body.innerText.includes('待办') || document.querySelectorAll('.x-grid, table, [class*=grid]').length>0);
      log(`  标题=${title} 含待办/网格=${hasGrid}`);
      if (hasGrid) { ok=true; break; }
    } catch(e){ log('  失败: ' + e.message); }
  }

  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_tasklist.png', fullPage:false });
  log('截图: reports/probe_tasklist.png');

  if (!ok) { log('没有找到待办列表页，准备 dump 主按钮'); }

  // 尝试双击包含 SN 的行
  const dbl = await page.evaluate((sn) => {
    function fire(el, type){ el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true})); }
    // ExtJS grid rows
    const rows = [...document.querySelectorAll('.x-grid-row, [role=row], tr')];
    for (const r of rows) {
      if (r.textContent.includes(sn)) { fire(r,'dblclick'); return 'row-dblclick'; }
    }
    // 任何含 SN 的可点击元素
    const all = [...document.querySelectorAll('div,a,span,td')];
    for (const el of all) {
      if (el.textContent.trim() === sn || el.textContent.includes(sn)) { fire(el,'dblclick'); return 'el-dblclick'; }
    }
    return 'not-found';
  }, SN);
  log('双击结果: ' + dbl);

  await wait(10000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_after_open.png', fullPage:false });
  log('截图: reports/probe_after_open.png');

  // dump 所有可见按钮及窗口
  const dump = await page.evaluate(() => {
    const btns = [];
    document.querySelectorAll('button, a, span, input, .x-btn, .x-btn-inner, .x-toolbar').forEach(el => {
      const t = (el.textContent || el.value || '').trim();
      if (t && t.length < 30 && el.offsetParent !== null) btns.push(t);
    });
    const wins = [...document.querySelectorAll('.x-window, [class*=window]')].map(w => (w.querySelector('.x-window-header-text, [class*=header]')?.textContent||'').trim()).filter(Boolean);
    const iframes = [...document.querySelectorAll('iframe')].map(f => f.src);
    return { btns:[...new Set(btns)], wins, iframes };
  });
  log('按钮: ' + JSON.stringify(dump.btns));
  log('窗口: ' + JSON.stringify(dump.wins));
  log('iframe: ' + JSON.stringify(dump.iframes));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
