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
  await wait(15000);

  // 方式1: dblclick 文本
  log('方式1: dblclick text=SN');
  try {
    await page.dblclick(`text=${SN}`);
    await wait(10000);
    const url = await page.evaluate(() => location.href);
    log('  当前URL: ' + url);
    if (url !== 'http://bpm.timesgroup.cn/') { log('  ✅ 成功'); }
    else { log('  ❌ 仍在首页'); }
  } catch(e){ log('  失败: ' + e.message); }

  // 方式2: dblclick 包含SN的div/grid-row
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(8000);
  log('方式2: dblclick div:has-text(SN)');
  try {
    await page.locator('div:has-text("' + SN + '")').first().dblclick();
    await wait(10000);
    const url = await page.evaluate(() => location.href);
    log('  当前URL: ' + url);
  } catch(e){ log('  失败: ' + e.message); }

  // 方式3: evaluate 找到SN的祖先行并dispatch dblclick
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(8000);
  log('方式3: dispatch dblclick on ancestor row');
  const res3 = await page.evaluate((sn) => {
    function findAncestor(el, cls) { while(el && !el.classList?.contains(cls)) el=el.parentElement; return el; }
    function fire(el,type){ el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,detail:2})); }
    const el = [...document.querySelectorAll('*')].find(e => e.textContent.trim()===sn);
    if (!el) return 'sn-element-not-found';
    // 尝试几个祖先
    const candidates = [];
    let p = el;
    for (let i=0;i<10 && p;i++) { candidates.push(p); p = p.parentElement; }
    for (const c of candidates) {
      fire(c,'dblclick');
      if (c.classList && (c.classList.contains('x-grid-row') || c.tagName==='TR')) { return 'fired-on-row'; }
    }
    return 'fired-all-ancestors';
  }, SN);
  log('  ' + res3);
  await wait(10000);
  const url3 = await page.evaluate(() => location.href);
  log('  当前URL: ' + url3);

  // 方式4: 直接点击"批量同意"（仅探测按钮是否存在）
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(8000);
  log('方式4: 探测批量同意与复选框');
  const bulk = await page.evaluate(() => {
    const res = { bulkAgree: false, checkboxes: 0, rowSelectors: [] };
    document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner').forEach(el => {
      if ((el.textContent||'').trim() === '批量同意') res.bulkAgree = true;
    });
    document.querySelectorAll('input[type=checkbox]').forEach(cb => res.checkboxes++);
    // 找可能的行元素
    ['.x-grid-row','[role=row]','.x-grid-item','tr'].forEach(sel => {
      const n = document.querySelectorAll(sel).length;
      if (n>0) res.rowSelectors.push(sel + ':' + n);
    });
    return res;
  });
  log('  ' + JSON.stringify(bulk));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
