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

  // Get tasks
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum,Desc:x.Description}));
  });
  log(`${tasks.length}条待办`);
  if (tasks.length === 0) { await b.close(); return; }

  for (const task of tasks) {
    log(`\n=== ${task.SN} - ${task.Desc} ===`);

    // Open Process.aspx with pid
    await page.goto(`http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}`, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });

    // Wait for "同意" button to appear
    log('等待审批按钮...');
    try {
      await page.waitForFunction(() => {
        const all = document.querySelectorAll('button, a, span, div');
        for (const el of all) {
          if (el.textContent.trim() === '同意' && el.offsetParent !== null) return true;
        }
        return false;
      }, { timeout: 60000 });
      log('  ✓ 找到"同意"按钮');
    } catch(e) {
      log('  ⚠️ 60秒内未找到同意按钮，跳过');
      continue;
    }

    await wait(2000);

    // Click "同意" using Playwright locator
    log('点击同意...');
    try {
      // Try Playwright's text locator
      const agreeBtn = page.locator('a:has-text("同意"), button:has-text("同意"), span:has-text("同意")').filter({ hasText: /^同意$/ }).first();
      await agreeBtn.click({ timeout: 10000 });
      log('  ✓ 点击成功');
    } catch(e) {
      log(`  Playwright click failed: ${e.message}`);
      // Fallback: force click via evaluate
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('a, button, span')) {
          if (el.textContent.trim() === '同意' && el.offsetParent) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return;
          }
        }
      });
      log('  ✓ fallback click');
    }

    await wait(5000);

    // Dump current page state to understand what happened
    const state = await page.evaluate(() => {
      const body = document.body.innerText || '';
      return {
        has确定: body.includes('确定'),
        has是: body.includes('是否'),
        has确认: body.includes('确认'),
        bodyLen: body.length,
        preview: body.substring(0, 500)
      };
    });
    log(`  状态: ${JSON.stringify(state)}`);

    // Handle confirmation dialogs
    for (let round = 0; round < 5; round++) {
      const clicked = await page.evaluate(() => {
        // Fill textarea
        for (const ta of document.querySelectorAll('textarea')) {
          if (ta.offsetParent && !ta.value) {
            ta.value = '同意';
            ta.dispatchEvent(new Event('input', {bubbles:true}));
            ta.dispatchEvent(new Event('change', {bubbles:true}));
          }
        }
        // Click confirm buttons
        for (const t of ['确定', '是', '确认', '提交', 'OK']) {
          for (const el of document.querySelectorAll('button, a, span')) {
            if (el.textContent.trim() === t && el.offsetParent) {
              el.click(); return t;
            }
          }
        }
        return null;
      });
      if (!clicked) break;
      log(`  → ${clicked}`);
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
  log('完成');
})().catch(e => console.error(e));
