const { chromium } = require('playwright');
const BPM_URL = 'http://bpm.timesgroup.cn';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 12000));

  // REQ20260914416 (SRM非合同请款, 已通过) 的 TaskID 从已通过列表里找
  const fs = require('fs');
  const raw = fs.readFileSync('E:/workbuddy/Claw/.workbuddy/bpm_output/hist_approved_latest.json', 'utf8');
  const m = raw.match(/"SerialNum":\s*"REQ20260914416"[\s\S]{0,600}?"TaskID":\s*(\d+)/);
  const taskId = m ? m[1] : null;
  console.log('TaskID =', taskId);
  if (!taskId) { await browser.close(); return; }

  const probes = [
    '/YZSoft.Services.REST/BPM/Task.ashx?method=GetTaskInfo&TaskID=' + taskId,
    '/YZSoft.Services.REST/BPM/Process.ashx?method=GetProcessTrace&ProcessID=' + taskId,
    '/YZSoft.Services.REST/BPM/Task.ashx?method=GetTaskTrace&TaskID=' + taskId
  ];
  for (const p of probes) {
    const t = await page.evaluate(async (u) => {
      try { const r = await fetch(u, { credentials: 'include' }); return 'HTTP ' + r.status + ' :: ' + (await r.text()).slice(0, 600); }
      catch (e) { return 'ERR ' + e.message; }
    }, p);
    console.log('\n=== ' + p.split('?')[0].split('/').pop() + '?' + p.split('?')[1].slice(0, 60) + ' ===');
    console.log(t);
  }
  await browser.close();
})();
