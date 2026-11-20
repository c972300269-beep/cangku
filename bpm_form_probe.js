const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox']
  });
  const ctx = await b.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  });
  const page = await ctx.newPage();

  // Intercept ALL requests/responses
  const allRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('favicon') && !url.includes('.css') && !url.includes('.js') && 
        !url.includes('.png') && !url.includes('.gif') && !url.includes('.svg') &&
        !url.includes('google') && !url.includes('ext-all')) {
      allRequests.push({
        url: url.replace(/http:\/\/bpm\.timesgroup\.cn/g, ''),
        method: req.method(),
        postData: req.postData()?.substring(0, 500),
        timestamp: Date.now()
      });
    }
  });
  
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('.ashx') || url.includes('.aspx') || url.includes('Form') || url.includes('Task') || url.includes('Process')) {
      try {
        const body = await resp.text();
        if (body.length < 5000) {
          allRequests.push({
            RESPONSE: url.replace(/http:\/\/bpm\.timesgroup\.cn/g, ''),
            status: resp.status(),
            body: body.substring(0, 500),
            timestamp: Date.now()
          });
        }
      } catch(e) {}
    }
  });

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(20000);

  // Get task info
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(), {credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum}));
  });
  
  // Clear previous requests
  allRequests.length = 0;
  
  // Navigate to Process.aspx
  const url = `/YZSoft/Forms/Process.aspx?TaskID=${tasks[0].TaskID}&StepID=${tasks[0].StepID}`;
  log(`\n导航到: ${url}`);
  
  await page.goto(`http://bpm.timesgroup.cn${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(15000); // Wait for AJAX
  
  log(`\n捕获 ${allRequests.length} 个请求:`);
  allRequests.forEach((r, i) => {
    if (r.url) {
      log(`  REQ ${i}: ${r.method} ${r.url}`);
      if (r.postData) log(`    POST: ${r.postData}`);
    }
    if (r.RESPONSE) {
      log(`  RES ${i}: [${r.status}] ${r.RESPONSE}`);
      if (r.body) log(`    Body: ${r.body}`);
    }
  });
  
  // Look for the key form-loading API
  const formApi = allRequests.find(r => r.url && (r.url.includes('LoadTask') || r.url.includes('GetTask') || r.url.includes('Form')));
  log(`\n表单API: ${formApi ? formApi.url : '未找到'}`);

  // Also check page HTML
  const html = await page.evaluate(() => {
    return (document.body?.innerHTML || '').substring(0, 2000);
  });
  log(`\n页面HTML:\n${html.substring(0, 1000)}`);

  await b.close();
})().catch(e => console.error(e));
