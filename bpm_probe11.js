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

  const logs = [];
  page.on('console', msg => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[reqfail] ${req.url()} ${req.failure()?.errorText}`));

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(15000);

  log('双击 SN...');
  await page.dblclick(`text=${SN}`);
  await wait(20000);

  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyLen: document.body.innerText.length,
    hasDisagree: [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意')
  }));
  log('状态: ' + JSON.stringify(info));

  log('\n=== logs ===');
  logs.slice(0,100).forEach(l => log(l));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
