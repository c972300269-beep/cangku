const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(() => {}); } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
      args: ['--no-sandbox']
    });

    const page = await (await browser.newContext({
      viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true
    })).newPage();

    // Login via NT auth
    console.log('[1/3] 登录 BPM (NT认证)...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(12000);

    // Fetch worklist
    console.log('[2/3] 获取待办任务...');
    const tasks = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
      const t = await r.text();
      const c = t.replace(/new Date\(([^)]+)\)/g, '"date"');
      return (JSON.parse(c).children || []).map(x => ({
        TaskID: x.TaskID, StepID: x.StepID, SN: x.SerialNum,
        Desc: x.Description, Node: x.NodeName, ProcessName: x.ProcessName,
        Sender: x.Sender || x.Originator, ReceiveDate: x.ReceiveDate
      }));
    });

    console.log(`\n===== 待办任务: ${tasks.length} 条 =====\n`);

    if (tasks.length === 0) {
      console.log('🎉 没有需要审批的流程！');
    } else {
      tasks.forEach((t, i) => {
        console.log(`--- 第 ${i + 1} 条 ---`);
        console.log(`  流水号: ${t.SN}`);
        console.log(`  流程: ${t.ProcessName || '未知'}`);
        console.log(`  描述: ${t.Desc || '无描述'}`);
        console.log(`  当前节点: ${t.Node || '未知'}`);
        console.log(`  发起人: ${t.Sender || '未知'}`);
        console.log(`  时间: ${t.ReceiveDate || '未知'}`);
        console.log();
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await safeClose(browser);
  }
})();
