const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox','--auth-server-allowlist=bpm.timesgroup.cn','--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const page = await (await b.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  })).newPage();

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);

  // Get pending tasks
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum,Desc:x.Description}));
  });
  log(`${tasks.length}条待办`);
  tasks.forEach(t => log(`  [${t.SN}] ${t.Desc}`));
  if (tasks.length === 0) { await b.close(); return; }

  for (const task of tasks) {
    log(`\n${'='.repeat(50)}`);
    log(`审批: ${task.SN} - ${task.Desc}`);
    
    // Step 1: Get form info via API (pid = StepID)
    log('1. 获取表单信息...');
    const formInfo = await page.evaluate(async (args) => {
      const params = new URLSearchParams({
        method: 'GetProcessInfo',
        TaskID: String(args.taskID),
        StepID: String(args.stepID),
        pid: String(args.stepID),
        Permisions: 'RecedeBack,RecedeRestart,Reject,Transfer,Inform,InviteIndicate,Public,Jump,Abort',
        _dc: String(Date.now())
      });
      const r = await fetch('/YZSoft.Services.REST/BPM/Form.ashx?' + params.toString(), { credentials: 'include' });
      const text = await r.text();
      try { return JSON.parse(text); } catch(e) { return { error: text }; }
    }, { taskID: task.TaskID, stepID: task.StepID });
    
    if (!formInfo.success) {
      log(`  ❌ 获取失败: ${formInfo.errorMessage}`);
      continue;
    }
    log(`  uid=${formInfo.uid} sn=${formInfo.sn} taskid=${formInfo.taskid}`);

    // Step 2: Navigate to form page
    // The form URL might be relative or absolute
    let formUrl = formInfo.url || '';
    log(`2. 表单URL: ${formUrl}`);
    
    if (formUrl.startsWith('/')) {
      formUrl = 'http://bpm.timesgroup.cn' + formUrl;
    }
    
    // Add params
    const separator = formUrl.includes('?') ? '&' : '?';
    formUrl += `${separator}TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}`;
    log(`   完整: ${formUrl}`);
    
    await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Step 3: Wait for form to load
    log('3. 等待表单加载...');
    let loaded = false;
    for (let i = 0; i < 30; i++) {
      await wait(3000);
      const state = await page.evaluate(() => {
        const body = document.body ? (document.body.innerText || '') : '';
        const btns = [...document.querySelectorAll('button, a, span, input[type=button], input[type=submit]')]
          .filter(el => el.offsetParent !== null)
          .map(el => (el.textContent || el.value || '').trim())
          .filter(t => t.length > 0 && t.length < 20);
        
        const iframes = [...document.querySelectorAll('iframe')].map(f => {
          try {
            const doc = f.contentDocument || f.contentWindow.document;
            return doc?.body?.innerText?.substring(0, 300) || '';
          } catch(e) { return ''; }
        }).filter(Boolean);
        
        return {
          body: body.substring(0, 300),
          btns,
          iframes,
          hasApprove: body.includes('同意') || body.includes('提交') || body.includes('通过'),
          isError: body.includes('错误') || body.includes('Error'),
          bodyLen: body.length
        };
      });
      
      if (i < 3 || state.hasApprove) {
        log(`  [${i+1}] len=${state.bodyLen} btns=${state.btns?.join(',')} approve=${state.hasApprove}`);
        if (state.iframes?.length > 0) {
          state.iframes.forEach((txt, j) => log(`    iframe[${j}]: ${txt.substring(0, 100)}`));
        }
      }
      
      if (state.hasApprove && state.bodyLen > 50) {
        loaded = true;
        break;
      }
      if (state.isError) {
        log(`  错误页面`);
        break;
      }
    }
    
    if (!loaded) {
      log('  ⚠️ 表单未找到审批按钮，跳过');
      continue;
    }

    // Step 4: Click "同意" or "提交"
    log('4. 点击审批按钮...');
    
    // First check iframe
    const clickInfo = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          if (!doc) continue;
          for (const text of ['同意', '提交', '通过']) {
            for (const el of doc.querySelectorAll('button, a, span, input')) {
              const t = (el.textContent || el.value || '').trim();
              if (t === text && el.offsetParent !== null) {
                return { location: 'iframe', text };
              }
            }
          }
        } catch(e) {}
      }
      
      // Main page
      for (const text of ['同意', '提交', '通过']) {
        for (const el of document.querySelectorAll('button, a, span, input')) {
          const t = (el.textContent || el.value || '').trim();
          if (t === text && el.offsetParent !== null) {
            return { location: 'main', text };
          }
        }
      }
      return { found: false };
    });
    
    if (clickInfo.found) {
      log(`  找到按钮: ${clickInfo.location}/${clickInfo.text}`);
      
      if (clickInfo.location === 'iframe') {
        await page.evaluate((text) => {
          const iframes = document.querySelectorAll('iframe');
          for (const f of iframes) {
            try {
              const doc = f.contentDocument || f.contentWindow.document;
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
        }, clickInfo.text);
      } else {
        // Use Playwright mouse click for reliability
        const rect = await page.evaluate((text) => {
          for (const el of document.querySelectorAll('button, a, span, input')) {
            if ((el.textContent || el.value || '').trim() === text && el.offsetParent) {
              const r = el.getBoundingClientRect();
              return { x: r.x + r.w/2, y: r.y + r.h/2 };
            }
          }
          return null;
        }, clickInfo.text);
        
        if (rect) {
          await page.mouse.click(rect.x, rect.y);
          log(`  Playwright click: ${Math.round(rect.x)},${Math.round(rect.y)}`);
        }
      }
      
      await wait(5000);
    } else {
      log('  ❌ 未找到审批按钮');
      continue;
    }

    // Step 5: Handle confirmations
    log('5. 处理确认...');
    for (let round = 0; round < 3; round++) {
      // Fill textareas
      await page.evaluate(() => {
        for (const ta of document.querySelectorAll('textarea')) {
          if (ta.offsetParent && !ta.value) {
            ta.value = '同意';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      await wait(500);
      
      // Click confirm
      const confirmed = await page.evaluate(() => {
        for (const text of ['确定', '是', '确认', '提交', 'OK']) {
          for (const el of document.querySelectorAll('button, a, span')) {
            if (el.textContent.trim() === text && el.offsetParent !== null) {
              el.click();
              return text;
            }
          }
        }
        return null;
      });
      
      if (!confirmed) break;
      log(`  点击了"${confirmed}"`);
      await wait(3000);
    }

    // Step 6: Verify
    log('6. 验证...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(8000);
    
    const gone = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
      return !r.text().includes(sn);
    }, task.SN);
    
    if (gone) {
      log(`  ✅✅✅ 审批成功！${task.SN} 已移除`);
    } else {
      log(`  ⚠️ 审批未成功，仍在待办`);
    }
  }

  // Final summary
  const remaining = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>`${x.SerialNum} ${x.Description}`);
  });
  log(`\n最终待办: ${remaining.length}条`);
  remaining.forEach(r => log(`  ${r}`));

  await b.close();
  log('\n完成');
})().catch(e => console.error(e));
