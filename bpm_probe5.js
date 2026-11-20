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

  // 定位包含 SN 的行，尝试双击打开
  const row = page.locator('tr:has-text("' + SN + '")').first();
  const count = await row.count();
  log('找到行数: ' + count);

  let popup;
  try {
    [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 8000 }),
      row.dblclick()
    ]);
    log('双击打开 popup');
  } catch(e) {
    log('无 popup，当前页双击: ' + e.message);
    await row.dblclick().catch(()=>{});
    popup = null;
  }

  await wait(10000);
  const target = popup || page;
  await target.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_after_dblclick.png', fullPage:false });
  log('截图: reports/probe_after_dblclick.png');

  const info = await target.evaluate(() => {
    const res = { title: document.title, url: location.href, btns: [], iframes: [], wins: [] };
    document.querySelectorAll('button, a, span, input, .x-btn, .x-btn-inner, .x-toolbar').forEach(el => {
      const t = (el.textContent || el.value || '').trim();
      if (t && t.length < 40) res.btns.push(t);
    });
    document.querySelectorAll('iframe').forEach(f => res.iframes.push(f.src));
    document.querySelectorAll('.x-window').forEach(w => {
      res.wins.push((w.querySelector('.x-window-header-text')?.textContent || '').trim());
    });
    return res;
  });
  log(JSON.stringify(info, null, 2));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
