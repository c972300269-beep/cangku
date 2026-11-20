const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(msg); }

// 从 probe5 获取的 iframe URL
const URL = 'http://bpm.timesgroup.cn/YZSoft/Forms/XForm/%E9%82%BB%E9%87%8C%E7%B1%BB/DHR%E7%B3%BB%E7%BB%9F/%E8%A1%8C%E6%94%BF%E8%80%83%E5%8B%A4%E7%B1%BB/%E9%82%BB%E9%87%8C-%E8%A1%A5%E5%8D%A1%E7%94%B3%E8%AF%B7%E5%AE%A1%E6%89%B9.aspx?pid=138340291&state=running&tid=10778528';

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

  log('直接打开审批 URL...');
  await page.goto(URL, { waitUntil:'domcontentloaded', timeout:30000 });
  await wait(10000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_direct_url.png', fullPage:false });

  const info = await page.evaluate(() => {
    const res = { url: location.href, title: document.title, btns: [], iframes: [] };
    document.querySelectorAll('button, a, span, input, .x-btn, .x-btn-inner, .x-toolbar').forEach(el => {
      const t = (el.textContent || el.value || '').trim();
      if (t && t.length < 40) res.btns.push(t);
    });
    document.querySelectorAll('iframe').forEach(f => res.iframes.push(f.src));
    return res;
  });
  log(JSON.stringify(info, null, 2));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
