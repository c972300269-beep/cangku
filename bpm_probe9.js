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

  // 方法A: 双击 .x-grid-row:has-text(SN)
  log('方法A: .x-grid-row:has-text(SN)');
  try {
    const row = page.locator('.x-grid-row:has-text("' + SN + '")').first();
    log('  找到行: ' + await row.count());
    await row.dblclick();
    await wait(12000);
    const info = await page.evaluate(() => {
      const hasDisagree = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意');
      return { url: location.href, hasDisagree, iframes: document.querySelectorAll('iframe').length };
    });
    log('  ' + JSON.stringify(info));
  } catch(e){ log('  失败: ' + e.message); }

  // 方法B: 用 evaluate 找到 .x-grid-row 并触发 ExtJS rowdblclick
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(10000);
  log('方法B: evaluate find .x-grid-row and dispatch dblclick');
  try {
    const res = await page.evaluate((sn) => {
      const rows = [...document.querySelectorAll('.x-grid-row, .x-grid-item')];
      const row = rows.find(r => r.textContent.includes(sn));
      if (!row) return 'row-not-found';
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles:true, cancelable:true, view:window, detail:2 }));
      return 'dispatched';
    }, SN);
    log('  ' + res);
    await wait(12000);
    const info = await page.evaluate(() => {
      const hasDisagree = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意');
      return { url: location.href, hasDisagree, iframes: document.querySelectorAll('iframe').length };
    });
    log('  ' + JSON.stringify(info));
  } catch(e){ log('  失败: ' + e.message); }

  // 方法C: 双击 .x-grid-item
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(10000);
  log('方法C: .x-grid-item:has-text(SN)');
  try {
    await page.locator('.x-grid-item:has-text("' + SN + '")').first().dblclick();
    await wait(12000);
    const info = await page.evaluate(() => {
      const hasDisagree = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意');
      return { url: location.href, hasDisagree, iframes: document.querySelectorAll('iframe').length };
    });
    log('  ' + JSON.stringify(info));
  } catch(e){ log('  失败: ' + e.message); }

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
