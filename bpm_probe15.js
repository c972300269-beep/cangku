const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(msg); }

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

  const methods = await page.evaluate(() => {
    const mgr = window.YZSoft && YZSoft.BPM && YZSoft.BPM.TaskOperation && YZSoft.BPM.TaskOperation.Manager;
    if (!mgr) return { found: false };
    const proto = Object.getPrototypeOf(mgr);
    return { found: true, own: Object.keys(mgr).filter(k => typeof mgr[k] === 'function'), proto: Object.getOwnPropertyNames(proto).filter(k => typeof proto[k] === 'function' && k !== 'constructor') };
  });
  log('Manager 方法: ' + JSON.stringify(methods));

  // 也尝试调用 Manager.BatchApprove 自动弹窗？不行，它需要 grid。

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
