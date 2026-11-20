const { chromium } = require('playwright');

const TASK_SN = 'REQ20260725900';  // 林武汉调班申请

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();

  console.log('[1] 登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 10000));
  console.log('  标题:', await page.title());

  console.log('[2] 获取待办列表...');
  const raw = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList', { credentials: 'include' });
    return await r.text();
  });
  const clean = raw.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, 
    (m,y,mo,d,h,mi,s) => '"' + new Date(+y,+mo,+d,+h,+mi,+s).toISOString() + '"');
  const data = JSON.parse(clean);
  const tasks = data.children || data.rows || [];

  console.log('  原始响应:', raw.substring(0, 300));
  console.log('  解析后:', JSON.stringify(data).substring(0, 300));
  if (tasks.length === 0) {
    console.log('  无待办 - 检查是否有success字段...');
    console.log('  success:', data.success, 'errorMessage:', data.errorMessage);
    await browser.close();
    return;
  }

  console.log('  待办数:', tasks.length);
  const task = tasks.find(t => t.SerialNum === TASK_SN);
  if (!task) {
    console.log('  未找到', TASK_SN);
    tasks.forEach(t => console.log('  -', t.SerialNum, t.ProcessName));
    await browser.close();
    return;
  }

  console.log('  目标:', task.SerialNum, task.ProcessName);
  console.log('  TaskID:', task.TaskID);

  // Open task form page
  console.log('[3] 打开任务表单...');
  await page.goto('http://bpm.timesgroup.cn/BPM2018/Workflow/TaskList.aspx', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 8000));

  // Double-click the task row to open
  const opened = await page.evaluate(async (sn) => {
    const rows = document.querySelectorAll('.x-grid-row, .x-grid-item, tr.x-grid-row');
    for (const row of rows) {
      if (row.textContent.includes(sn)) {
        // Double click
        row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return 'dblclick';
      }
    }
    // Try single click
    const allRows = document.querySelectorAll('tr, .x-grid-row, .x-grid-item');
    for (const row of allRows) {
      if (row.textContent.includes(sn)) {
        row.click();
        return 'click';
      }
    }
    return 'not found: ' + document.body.textContent.substring(0, 200);
  }, TASK_SN);

  console.log('  打开:', opened);
  await new Promise(r => setTimeout(r, 5000));

  // Check current page state
  const state = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a.x-btn, span.x-btn-inner, .x-btn')]
      .map(b => b.textContent.trim()).filter(Boolean);
    const iframes = document.querySelectorAll('iframe').length;
    const tabs = [...document.querySelectorAll('.x-tab, [class*=tab]')]
      .map(t => t.textContent.trim()).filter(Boolean);
    return { btns: btns.slice(0, 30), iframes, tabs };
  });
  console.log('  页面状态:', JSON.stringify(state));

  // Try to find and click 同意/通过/提交
  console.log('[4] 查找审批按钮...');
  const btnResult = await page.evaluate(() => {
    // Check all iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const btns = doc.querySelectorAll('button, input[type=button], input[type=submit], .x-btn');
        for (const b of btns) {
          const t = (b.textContent || b.value || b.title || '').trim();
          if (t.includes('同意') || t.includes('通过') || t.includes('提交') || t.includes('批准')) {
            b.click();
            return 'clicked: ' + t + ' in iframe';
          }
        }
      } catch(e) {}
    }
    // Main page
    const btns = document.querySelectorAll('button, input[type=button], input[type=submit], .x-btn, a');
    for (const b of btns) {
      const t = (b.textContent || b.value || b.title || '').trim();
      if (t.includes('同意') || t.includes('通过') || t.includes('提交') || t.includes('批准')) {
        b.click();
        return 'clicked: ' + t + ' in main';
      }
    }
    return 'no button found';
  });
  console.log('  ' + btnResult);

  await new Promise(r => setTimeout(r, 3000));

  // Check for result
  const resultText = await page.evaluate(() => document.body.textContent.substring(0, 500));
  console.log('  结果:', resultText);

  await browser.close();
  console.log('Done');
})().catch(e => { console.error(e); process.exit(1); });
