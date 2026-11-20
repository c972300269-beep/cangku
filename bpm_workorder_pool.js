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

    // Login
    console.log('[1/4] 登录 BPM...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(12000);

    // Try to find 工单池 - first get module tree
    console.log('[2/4] 获取模块列表...');
    const modulesRaw = await page.evaluate(async () => {
      const r = await fetch('/BPM2018/Modules/BPM.ashx?method=GetModuleTree', { credentials: 'include' });
      return await r.text();
    });
    
    // Search for 工单 related modules
    const 工单Matches = modulesRaw.match(/工单[^"]*/g) || [];
    const poolMatches = modulesRaw.match(/池[^"]*/g) || [];
    console.log('模块中"工单"匹配:', 工单Matches.length > 0 ? 工单Matches.join(', ') : '无');
    console.log('模块中"池"匹配:', poolMatches.length > 0 ? poolMatches.join(', ') : '无');

    // Try work order pool APIs
    console.log('[3/4] 尝试工单池API...');
    const apis = [
      '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkOrderPool',
      '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkOrderList',
      '/YZSoft.Services.REST/BPM/WorkOrder.ashx?method=GetPool',
      '/YZSoft.Services.REST/BPM/WorkOrder.ashx?method=GetList',
      '/BPM2018/Modules/BPM.ashx?method=GetWorkOrderPool',
      '/YZSoft.Services.REST/BPM/WorkOrderPool.ashx?method=GetList',
    ];

    let found = false;
    for (const api of apis) {
      try {
        const r = await page.evaluate(async (api) => {
          const res = await fetch(api + '?_dc=' + Date.now(), { credentials: 'include' });
          return { status: res.status, text: (await res.text()).substring(0, 200) };
        }, api);
        if (r.status === 200 && !r.text.includes('error') && !r.text.includes('Exception')) {
          console.log(`  ✅ ${api} -> ${r.text}`);
          found = true;
        }
      } catch (e) {
        // skip
      }
    }

    if (!found) {
      console.log('  未找到工单池API，尝试在页面中搜索...');
    }

    // Also try navigating to common work order pages
    console.log('[4/4] 尝试工单页面...');
    const pages = [
      'http://bpm.timesgroup.cn/BPM2018/WorkOrder/Pool.aspx',
      'http://bpm.timesgroup.cn/BPM2018/WorkOrder/MyWorkOrder.aspx',
      'http://bpm.timesgroup.cn/YZSoft/Forms/WorkOrderPool.aspx',
    ];

    for (const p of pages) {
      try {
        const resp = await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 10000 });
        if (resp && resp.status() === 200) {
          const title = await page.title();
          console.log(`  页面: ${p} -> 标题: "${title}"`);
        }
      } catch (e) {
        // skip
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await safeClose(browser);
  }
})();
