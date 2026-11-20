const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await b.newContext({
    viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true
  })).newPage();

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(12000);

  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum,Desc:x.Description}));
  });
  log(`${tasks.length}条待办`);

  for (const task of tasks) {
    log(`\n=== ${task.SN} - ${task.Desc} ===`);

    // Navigate to Process.aspx WITH pid parameter
    const processUrl = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}`;
    log(`URL: Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}`);
    
    await page.goto(processUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for ExtJS form to render
    log('等待表单渲染...');
    let found = false;
    for (let i = 0; i < 30; i++) {
      await wait(3000);
      
      const state = await page.evaluate(() => {
        const body = document.body ? document.body.innerText || '' : '';
        
        // Check all visible buttons
        const btns = [...document.querySelectorAll('button, a, span')]
          .filter(el => el.offsetParent !== null && el.textContent.trim().length > 1 && el.textContent.trim().length < 15)
          .map(el => el.textContent.trim())
          .filter(Boolean);
        
        // Check iframes
        const iframeBtns = [];
        const iframes = document.querySelectorAll('iframe');
        for (const f of iframes) {
          try {
            const doc = f.contentDocument || f.contentWindow.document;
            if (doc) {
              const ibtns = [...doc.querySelectorAll('button, a, span')]
                .filter(el => el.offsetParent !== null)
                .map(el => el.textContent.trim())
                .filter(t => t.length > 1 && t.length < 15);
              iframeBtns.push(...ibtns);
            }
          } catch(e) {}
        }
        
        return {
          has同意: btns.includes('同意') || iframeBtns.includes('同意'),
          has提交: btns.includes('提交') || iframeBtns.includes('提交'),
          btns: [...new Set([...btns, ...iframeBtns])].slice(0, 30),
          bodyLen: body.length,
          iframes: iframes.length
        };
      });
      
      if (i < 3 || state.has同意) {
        log(`  [${i+1}] btns=${state.btns?.join(',')} agree=${state.has同意} submit=${state.has提交} iframes=${state.iframes}`);
      }
      
      if (state.has同意 || state.has提交) {
        found = true;
        break;
      }
    }
    
    if (!found) {
      log('  ⚠️ 未找到审批按钮，跳过');
      continue;
    }

    // Click "同意"
    log('点击同意...');
    
    // Check if it's in iframe or main page
    const clickPos = await page.evaluate(() => {
      // Main page first
      for (const el of document.querySelectorAll('button, a, span')) {
        if (el.textContent.trim() === '同意' && el.offsetParent !== null) {
          const r = el.getBoundingClientRect();
          return { loc: 'main', x: r.x + r.w/2, y: r.y + r.h/2, tag: el.tagName };
        }
      }
      // Iframes
      const iframes = document.querySelectorAll('iframe');
      for (const f of iframes) {
        try {
          const doc = f.contentDocument || f.contentWindow.document;
          if (!doc) continue;
          for (const el of doc.querySelectorAll('button, a, span')) {
            if (el.textContent.trim() === '同意') {
              const r = el.getBoundingClientRect();
              return { loc: 'iframe', x: r.x + r.w/2, y: r.y + r.h/2, tag: el.tagName };
            }
          }
        } catch(e) {}
      }
      return null;
    });
    
    if (clickPos) {
      log(`  位置: ${clickPos.loc} ${Math.round(clickPos.x)},${Math.round(clickPos.y)}`);
      await page.mouse.click(clickPos.x, clickPos.y);
      await wait(5000);
    }

    // Handle any confirmations
    for (let round = 0; round < 3; round++) {
      const confirmed = await page.evaluate(() => {
        // Fill comments
        for (const ta of document.querySelectorAll('textarea')) {
          if (ta.offsetParent && !ta.value) {
            ta.value = '同意';
            ta.dispatchEvent(new Event('input', {bubbles:true}));
            ta.dispatchEvent(new Event('change', {bubbles:true}));
          }
        }
        // Click confirm
        for (const t of ['确定', '是', '确认', '提交', 'OK']) {
          for (const el of document.querySelectorAll('button, a, span')) {
            if (el.textContent.trim() === t && el.offsetParent) {
              el.click(); return t;
            }
          }
        }
        return null;
      });
      if (!confirmed) break;
      log(`  ${confirmed}`);
      await wait(3000);
    }

    // Go back and verify
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(8000);
    
    const gone = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
      const t = await r.text();
      return !t.includes(sn);
    }, task.SN);
    
    log(gone ? `  ✅✅✅ 审批成功！` : `  ⚠️ 仍在待办`);
  }

  const remaining = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>`${x.SerialNum} ${x.Description}`);
  });
  log(`\n最终待办: ${remaining.length}条`);
  remaining.forEach(r => log(`  ${r}`));

  await b.close();
  log('完成');
})().catch(e => console.error(e));
