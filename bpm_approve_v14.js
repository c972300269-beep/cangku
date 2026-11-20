const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await b.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  })).newPage();

  // Step 1: Login
  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(15000);

  // Step 2: Get tasks
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const text = await r.text();
    const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
    return (JSON.parse(clean).children || []).map(t => ({ 
      TaskID: t.TaskID, StepID: t.StepID, SerialNum: t.SerialNum, 
      ProcessName: t.ProcessName, Description: t.Description 
    }));
  });
  log(`${tasks.length}条待办`);
  tasks.forEach(t => log(`  [${t.SerialNum}] ${t.Description}`));

  if (tasks.length === 0) { await b.close(); return; }

  // Step 3: Process each task
  for (const task of tasks) {
    log(`\n=== 审批: ${task.SerialNum} ===`);
    log(`URL: /YZSoft/Forms/Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}`);
    
    // Navigate to form page
    await page.goto(`http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}`, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    
    // Wait for form to load asynchronously
    log('等待表单加载...');
    let formLoaded = false;
    for (let i = 0; i < 30; i++) {
      await wait(3000);
      
      const state = await page.evaluate(() => {
        const body = document.body ? (document.body.innerText || '') : '';
        
        // Check for common approval form elements
        const hasApprove = body.includes('同意') || body.includes('提交') || body.includes('通过');
        const stillLoading = body.includes('表单加载中') || body.includes('loading');
        const isError = body.includes('错误') || body.includes('Error');
        const is404 = body.includes('无法找到资源');
        
        // Find buttons
        const btns = [...document.querySelectorAll('button, a, span, input[type=button], input[type=submit]')]
          .filter(el => el.offsetParent !== null)
          .map(el => (el.textContent || el.value || '').trim())
          .filter(t => t.length > 0 && t.length < 20);
        
        return { hasApprove, stillLoading, isError, is404, bodyLen: body.length, btns, preview: body.substring(0, 300) };
      });
      
      log(`  ${i+1}: loading=${state.stillLoading} approve=${state.hasApprove} btns=${state.btns?.join(',')}`);
      
      if (state.hasApprove && !state.stillLoading) {
        formLoaded = true;
        break;
      }
      if (state.isError || state.is404) {
        log(`  错误: ${state.preview}`);
        break;
      }
    }
    
    if (!formLoaded) {
      log('  ⚠️ 表单未加载完成，跳过');
      continue;
    }
    
    // Find and click the "同意" button
    log('查找审批按钮...');
    const btnInfo = await page.evaluate(() => {
      // Check iframes first
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          if (!doc) continue;
          for (const text of ['同意', '提交', '通过']) {
            for (const el of doc.querySelectorAll('button, a, span, input')) {
              if ((el.textContent || el.value || '').trim() === text && el.offsetParent !== null) {
                return { location: 'iframe', text, tag: el.tagName };
              }
            }
          }
        } catch(e) {}
      }
      
      // Main page
      for (const text of ['同意', '提交', '通过']) {
        for (const el of document.querySelectorAll('button, a, span, input[type=button], input[type=submit]')) {
          const t = (el.textContent || el.value || '').trim();
          if (t === text && el.offsetParent !== null) {
            return { location: 'main', text, tag: el.tagName };
          }
        }
      }
      
      return { found: false };
    });
    
    log(`  按钮: ${JSON.stringify(btnInfo)}`);
    
    if (btnInfo.found) {
      // Click the button
      if (btnInfo.location === 'iframe') {
        await page.evaluate((text) => {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow.document;
              if (!doc) continue;
              for (const el of doc.querySelectorAll('button, a, span, input')) {
                if ((el.textContent || el.value || '').trim() === text) {
                  ['mousedown','mouseup','click'].forEach(e =>
                    el.dispatchEvent(new MouseEvent(e, { bubbles: true })));
                  return;
                }
              }
            } catch(e) {}
          }
        }, btnInfo.text);
      } else {
        await page.evaluate((text) => {
          for (const el of document.querySelectorAll('button, a, span, input')) {
            const t = (el.textContent || el.value || '').trim();
            if (t === text) {
              ['mousedown','mouseup','click'].forEach(e =>
                el.dispatchEvent(new MouseEvent(e, { bubbles: true })));
              return;
            }
          }
        }, btnInfo.text);
      }
      
      log(`  已点击"${btnInfo.text}"`);
      await wait(5000);
      
      // Handle any confirmation dialog
      log('  处理确认...');
      await page.evaluate(() => {
        // Fill textarea if any
        for (const ta of document.querySelectorAll('textarea')) {
          if (ta.offsetParent && !ta.value) {
            ta.value = '同意';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        // Click confirm
        for (const text of ['确定', '是', '确认', '提交']) {
          for (const el of document.querySelectorAll('button, a, span')) {
            if (el.textContent.trim() === text && el.offsetParent !== null) {
              el.click(); return;
            }
          }
        }
      });
      await wait(4000);
      
      // Second confirm (some forms have 2-step confirmation)
      await page.evaluate(() => {
        for (const text of ['确定', '是', '确认', '提交', 'OK']) {
          for (const el of document.querySelectorAll('button, a, span')) {
            if (el.textContent.trim() === text && el.offsetParent !== null) {
              el.click(); return;
            }
          }
        }
      });
      await wait(3000);
    }
    
    // Verify by going back to portal and checking
    log('  验证...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(10000);
    
    const stillThere = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
      return r.text().includes(sn);
    }, task.SerialNum);
    
    if (!stillThere) {
      log(`  ✅✅✅ 审批成功！${task.SerialNum} 已移除`);
    } else {
      log(`  ⚠️ 审批未成功，仍在待办`);
    }
  }

  await b.close();
  log('\n完成');
})().catch(e => console.error(e));
