const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

async function safeClose(browser) {
  if (!browser) return;
  try {
    await browser.close().catch(() => {});
  } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

(async () => {
  let b = null;
  try {
  b = await chromium.launch({
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
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum,Desc:x.Description,Node:x.NodeName}));
  });
  log(`${tasks.length}条待办`);
  tasks.forEach(t => log(`  [${t.SN}] ${t.Desc} (${t.Node})`));
  if (tasks.length === 0) { log('无待办任务'); return; }

  for (const task of tasks) {
    log(`\n=== ${task.SN} - ${task.Desc} ===`);

    await page.goto(`http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}`, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });

    // Wait for toolbar "同意" button
    log('等待审批按钮...');
    try {
      await page.waitForFunction(() => {
        for (const el of document.querySelectorAll('a, button, span')) {
          if (el.textContent.trim() === '同意' && el.offsetParent) return true;
        }
        return false;
      }, { timeout: 60000 });
    } catch(e) {
      log('  ⚠️ 无审批按钮，跳过');
      continue;
    }

    await wait(2000);

    // Click toolbar "同意"
    log('点击同意...');
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('a, button, span')) {
        if (el.textContent.trim() === '同意' && el.offsetParent) {
          el.click(); return;
        }
      }
    });
    await wait(3000);

    // Handle the approval dialog
    log('处理审批对话框...');
    
    // First: check what's visible
    const dlgState = await page.evaluate(() => {
      const body = document.body;
      const allBtns = [...document.querySelectorAll('button, a, span')]
        .filter(el => el.offsetParent)
        .map(el => ({
          text: el.textContent.trim(),
          tag: el.tagName,
          visible: el.offsetParent !== null
        }))
        .filter(b => b.text.length > 0 && b.text.length < 20);
      
      const allTextareas = [...document.querySelectorAll('textarea')]
        .filter(ta => ta.offsetParent)
        .map(ta => ({ placeholder: ta.placeholder, visible: true }));
      
      return { btns: allBtns, textareas: allTextareas, bodyPreview: body.innerText.substring(0, 500) };
    });
    log(`  ${JSON.stringify(dlgState)}`);

    // Step 1: Fill in approval comments
    if (dlgState.textareas.length > 0) {
      await page.evaluate(() => {
        for (const ta of document.querySelectorAll('textarea')) {
          if (ta.offsetParent) {
            ta.value = '同意';
            ta.dispatchEvent(new Event('input', {bubbles:true}));
            ta.dispatchEvent(new Event('change', {bubbles:true}));
          }
        }
      });
      await wait(500);
    }

    // Step 2: In the dialog, find and click "同意" (action selection)
    // The dialog might have "同意" and "不同意" as action choices
    // Then "确定" to confirm
    const finalClick = await page.evaluate(() => {
      const body = document.body;
      const allText = body.innerText || '';
      
      // Check if dialog has action selection (同意/不同意 单选)
      // Strategy: click "同意" in the dialog if it exists as a separate action
      // Then click "确定"
      
      // First try clicking "确定" which should submit with the default "同意" action
      for (const el of document.querySelectorAll('button, a, span')) {
        if (el.textContent.trim() === '确定' && el.offsetParent) {
          el.click();
          return '确定';
        }
      }
      
      // Fallback: click dialog "同意"
      for (const el of document.querySelectorAll('button, a, span')) {
        if (el.textContent.trim() === '同意' && el.offsetParent) {
          el.click();
          return '同意(in dialog)';
        }
      }
      return 'nothing';
    });
    log(`  最终点击: ${finalClick}`);
    await wait(5000);

    // Handle any further confirmation
    const finalState = await page.evaluate(() => {
      const body = document.body.innerText || '';
      return {
        hasOK: body.includes('确定'),
        bodyLen: body.length,
        preview: body.substring(0, 300)
      };
    });
    log(`  最终状态: ${JSON.stringify(finalState)}`);

    // If still in dialog, try once more
    if (finalState.hasOK && finalState.bodyLen < 200) {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, a, span')) {
          if (el.textContent.trim() === '确定' && el.offsetParent) {
            el.click(); return;
          }
        }
      });
      await wait(3000);
    }

    // Verify
    log('验证...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(8000);
    
    const gone = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
      const t = await r.text();
      return !t.includes(sn);
    }, task.SN);
    
    if (gone) {
      log(`  ✅✅✅ 审批成功！${task.SN} 已移除`);
    } else {
      log(`  ⚠️ 仍在待办`);
    }
  }

  const remaining = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>`${x.SerialNum} ${x.Description}`);
  });
  log(`\n最终待办: ${remaining.length}条`);
  remaining.forEach(r => log(`  ${r}`));

  log('完成');
  } finally {
    await safeClose(b);
  }
})().catch(e => console.error(e));
