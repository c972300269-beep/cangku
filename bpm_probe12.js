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

  const elInfo = await page.evaluate((sn) => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.trim() === sn);
    if (!a) return { found: false };
    const res = {
      found: true,
      tag: a.tagName,
      href: a.getAttribute('href'),
      class: a.className,
      id: a.id,
      onclick: a.getAttribute('onclick'),
      dataset: Object.assign({}, a.dataset),
      outerHTML: a.outerHTML,
      parentTag: a.parentElement?.tagName,
      parentClass: a.parentElement?.className,
      grandparentTag: a.parentElement?.parentElement?.tagName,
      grandparentClass: a.parentElement?.parentElement?.className,
    };
    // 尝试向上找 5 层 class
    let p = a;
    const path = [];
    for (let i=0;i<5;i++) { path.push({tag:p.tagName, cls:p.className?.toString().substring(0,60)}); p=p.parentElement; if(!p) break; }
    res.path = path;
    return res;
  }, SN);
  log(JSON.stringify(elInfo, null, 2));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
