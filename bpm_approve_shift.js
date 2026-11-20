const { chromium } = require('playwright');

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(() => {}); } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    console.log('登录BPM...');
    await page.goto('http://bpm.timesgroup.cn/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);

    // 获取待办
    const rawText = await page.evaluate(async () => {
      const resp = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now());
      return await resp.text();
    });

    const fixed = rawText.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (m, y, mo, d, h, mi, s) => {
      return '"' + new Date(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s)).toISOString() + '"';
    });
    const data = JSON.parse(fixed);
    const children = data.children || [];

    console.log(`待办任务: ${children.length}条`);
    let target = null;
    for (const t of children) {
      console.log(`  [${t.TaskID}] ${t.ProcessName}: ${t.Description}`);
      if ((t.Description || '').includes('林华敏')) {
        target = t;
        console.log('  ✅ 找到!');
        break;
      }
    }

    if (!target) {
      console.log('\n❌ 未找到林华敏的调班申请');
      return;
    }

    // 审批
    const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${target.TaskID}&StepID=${target.StepID}&pid=${target.StepID}`;
    console.log(`\n导航: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(10000);

    // 点击同意
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, a.x-btn, span.x-btn-inner');
      for (const b of btns) {
        if (b.textContent?.trim() === '同意') { b.click(); return; }
      }
    });

    await page.waitForTimeout(3000);

    // 点击确定
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, a.x-btn, span.x-btn-inner');
      for (const b of btns) {
        if (b.textContent?.trim() === '确定') { b.click(); return; }
      }
    });

    await page.waitForTimeout(3000);
    console.log('✅ 审批完成');

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    await safeClose(browser);
  }
})();
