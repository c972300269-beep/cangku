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

  // 用 Playwright 点击 REQ 链接
  log('点击: ' + SN);
  let popup;
  try {
    [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 5000 }),
      page.click(`text=${SN}`)
    ]);
    log('检测到 popup');
  } catch(e) {
    log('没有 popup，尝试当前页点击');
    await page.click(`text=${SN}`).catch(()=>{});
    popup = null;
  }

  await wait(12000);

  const target = popup || page;
  await target.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_after_click.png', fullPage:false });
  log('截图: reports/probe_after_click.png');

  const info = await target.evaluate(() => {
    const res = { title: document.title, url: location.href, btns: [], iframes: [], wins: [] };
    document.querySelectorAll('button, a, span, input, .x-btn, .x-btn-inner, .x-toolbar, .x-window-header-text, td').forEach(el => {
      const t = (el.textContent || el.value || '').trim();
      if (t && t.length < 30) res.btns.push(t);
    });
    document.querySelectorAll('iframe').forEach(f => res.iframes.push(f.src));
    document.querySelectorAll('.x-window').forEach(w => {
      res.wins.push((w.querySelector('.x-window-header-text')?.textContent || '').trim());
    });
    return res;
  });
  log(JSON.stringify(info, null, 2));

  // 如果存在 iframe，深入 dump
  const iframeInfo = await target.evaluate(() => {
    const all = [];
    document.querySelectorAll('iframe').forEach(f => {
      try {
        const doc = f.contentDocument || f.contentWindow.document;
        const btns = [];
        doc.querySelectorAll('button, a, span, input, .x-btn, .x-btn-inner, .x-toolbar').forEach(el => {
          const t = (el.textContent || el.value || '').trim();
          if (t && t.length < 30 && el.offsetParent !== null) btns.push(t);
        });
        all.push({ src: f.src, btns });
      } catch(e){ all.push({ src: f.src, error: e.message }); }
    });
    return all;
  });
  log('iframe buttons:' + JSON.stringify(iframeInfo, null, 2));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
