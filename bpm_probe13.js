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

  // 方法A: 对 <a> dispatch click
  log('方法A: dispatch click on <a>');
  let res = await page.evaluate((sn) => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === sn);
    if (!a) return 'a-not-found';
    a.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
    return 'dispatched-click';
  }, SN);
  log('  ' + res);
  await wait(15000);
  let info = await page.evaluate(() => ({ url: location.href, hasDisagree: [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意'), iframes: document.querySelectorAll('iframe').length }));
  log('  ' + JSON.stringify(info));

  // 方法B: 对 <td> dispatch dblclick
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(10000);
  log('方法B: dispatch dblclick on <td>');
  res = await page.evaluate((sn) => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === sn);
    if (!a) return 'a-not-found';
    const td = a.closest('td');
    if (!td) return 'td-not-found';
    td.dispatchEvent(new MouseEvent('dblclick', { bubbles:true, cancelable:true, view:window, detail:2 }));
    return 'dispatched-td-dblclick';
  }, SN);
  log('  ' + res);
  await wait(15000);
  info = await page.evaluate(() => ({ url: location.href, hasDisagree: [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意'), iframes: document.querySelectorAll('iframe').length }));
  log('  ' + JSON.stringify(info));

  // 方法C: 对 <tr> dispatch dblclick 且 target 设为 td
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(10000);
  log('方法C: dispatch dblclick on <tr> (bubbling from td)');
  res = await page.evaluate((sn) => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === sn);
    if (!a) return 'a-not-found';
    const td = a.closest('td');
    const tr = a.closest('tr');
    if (!tr) return 'tr-not-found';
    const evt = new MouseEvent('dblclick', { bubbles:true, cancelable:true, view:window, detail:2, relatedTarget: td });
    tr.dispatchEvent(evt);
    return 'dispatched-tr-dblclick';
  }, SN);
  log('  ' + res);
  await wait(15000);
  info = await page.evaluate(() => ({ url: location.href, hasDisagree: [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意'), iframes: document.querySelectorAll('iframe').length }));
  log('  ' + JSON.stringify(info));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
