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
  await wait(12000);

  // 截图首页
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_home.png', fullPage:false });
  log('截图 reports/probe_home.png');

  // dump 所有链接
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const t = (a.textContent||'').trim();
      const h = a.getAttribute('href')||'';
      if (t && t.length < 40 && !h.startsWith('javascript')) out.push(t + ' => ' + h);
    });
    return [...new Set(out)];
  });
  log('链接数: ' + links.length);
  links.slice(0,60).forEach(l => log('  ' + l));

  // dump 含待办/任务关键词的元素
  const todoEls = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const t = (el.textContent||'').trim();
      if ((t.includes('待办')||t.includes('待处理')||t.includes('我的任务')||t.includes('待我')) && t.length < 30 && el.children.length===0) {
        out.push(t + ' | tag=' + el.tagName + ' | cls=' + (el.className||'').toString().substring(0,50));
      }
    });
    return [...new Set(out)];
  });
  log('\n待办相关元素:');
  todoEls.slice(0,30).forEach(e => log('  ' + e));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
