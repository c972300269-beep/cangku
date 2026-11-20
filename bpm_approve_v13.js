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

  // Capture ALL network requests
  const requests = [];
  page.on('request', req => {
    const url = req.url();
    // Track form-related requests
    if (url.includes('Form') || url.includes('Process') || url.includes('Task') || 
        url.includes('Step') || url.includes('Render') || url.includes('View') ||
        url.includes('Workflow') || url.includes('.aspx') || url.includes('.ashx')) {
      requests.push({ url, method: req.method(), postData: req.postData() });
    }
  });

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(20000);

  // Wait for grid
  log('等待Grid...');
  await page.evaluate(() => new Promise(resolve => {
    let i = 0;
    const chk = () => {
      i++;
      if (typeof Ext !== 'undefined') {
        const g = Ext.ComponentQuery.query('grid').filter(x => x.store?.getCount?.() > 0);
        if (g.length > 0) { resolve(); return; }
      }
      if (i > 30) resolve(); else setTimeout(chk, 1000);
    }; chk();
  }));

  // Clear previous requests, then open form
  requests.length = 0;
  
  log('调用 FormManager.openTaskForProcess...');
  await page.evaluate(() => {
    const g = Ext.ComponentQuery.query('grid').filter(x => x.store?.getCount?.() > 0)[0];
    const rec = g.store.getAt(0);
    YZSoft.BPM.src.ux.FormManager.openTaskForProcess(rec.get('StepID'), {
      sn: rec.get('SerialNum'), sender: g
    });
  });
  
  // Wait for network requests
  await wait(10000);

  // Show captured form-related requests
  log(`\n捕获到 ${requests.length} 个相关请求:`);
  requests.forEach((r, i) => {
    log(`  ${i+1}. ${r.method} ${r.url}`);
    if (r.postData) log(`     POST: ${r.postData.substring(0, 200)}`);
  });

  // Look for key requests
  const formUrls = requests.filter(r => 
    r.url.includes('Process.aspx') || 
    r.url.includes('TaskForm') ||
    r.url.includes('form.aspx') ||
    r.url.includes('Render.aspx')
  );
  
  if (formUrls.length > 0) {
    log(`\n找到表单URL: ${formUrls[0].url}`);
    
    // Navigate to form directly
    const formUrl = formUrls[0].url;
    log(`直接导航到表单...`);
    await page.goto(formUrl.startsWith('http') ? formUrl : 'http://bpm.timesgroup.cn' + formUrl, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await wait(5000);
    
    // Check form content
    const formContent = await page.evaluate(() => {
      const body = document.body ? document.body.innerText || document.body.innerHTML.substring(0, 2000) : '';
      return {
        hasApprove: body.includes('同意') || body.includes('提交'),
        preview: body.substring(0, 500)
      };
    });
    log(`表单: ${JSON.stringify(formContent)}`);
    
    if (formContent.hasApprove) {
      log('找到审批按钮，点击...');
      await page.evaluate(() => {
        for (const t of ['同意', '提交', '通过']) {
          for (const el of document.querySelectorAll('button, a, span, input')) {
            if ((el.textContent || el.value || '').trim() === t) {
              el.click(); return;
            }
          }
        }
      });
      await wait(3000);
      
      // Confirm
      await page.evaluate(() => {
        for (const t of ['确定', '是', '确认']) {
          for (const el of document.querySelectorAll('button, a, span')) {
            if (el.textContent.trim() === t) { el.click(); return; }
          }
        }
      });
      await wait(3000);
    }
  } else {
    // No form URL found - try to find alternative approaches
    log('\n未找到表单URL。尝试替代方案...');
    
    // Try navigating to common form patterns
    const patterns = [
      '/YZSoft/Forms/Process.aspx?TaskID=10657940&StepID=136593613',
      '/YZSoft/Forms/Task.aspx?TaskID=10657940&StepID=136593613',
      '/BPM2018/BPM/Tasks/Process.aspx?TaskID=10657940',
    ];
    
    for (const p of patterns) {
      log(`尝试: ${p}`);
      try {
        await page.goto('http://bpm.timesgroup.cn' + p, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await wait(3000);
        const txt = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || '');
        if (txt.includes('同意') || txt.includes('提交')) {
          log(`  ✅ 找到表单！点击审批...`);
          await page.evaluate(() => {
            for (const t of ['同意', '提交', '通过']) {
              for (const el of document.querySelectorAll('button, a, span, input')) {
                if ((el.textContent || el.value || '').trim() === t) { el.click(); return; }
              }
            }
          });
          await wait(5000);
          break;
        } else {
          log(`  ✗ ${txt.substring(0, 100)}`);
        }
      } catch(e) {
        log(`  ✗ ${e.message.substring(0, 80)}`);
      }
    }
  }

  // Verify
  log('\n验证...');
  // Navigate back to portal to check
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(10000);
  
  const remaining = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const t = await r.text();
    const c = t.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (_,y,mo,d,h,mi,s) => '"' + new Date(+y,+mo,+d,+h,+mi,+s).toISOString() + '"');
    return (JSON.parse(c).children || []).map(x => x.SerialNum);
  });
  
  log(`剩余: ${remaining.length}条 - ${remaining.join(', ') || '无'}`);

  await b.close();
})().catch(e => console.error(e));
