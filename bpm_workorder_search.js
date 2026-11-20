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

    console.log('登录 BPM...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(12000);

    // 1. Search for 工单 in all processes
    console.log('\n===== 1. 流程查询中搜索"工单" =====');
    const allResult = await page.evaluate(async () => {
      try {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetAllAccessable&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
        const text = await r.text();
        // Try to parse
        try {
          const d = JSON.parse(text.replace(/new Date\(([^)]+)\)/g, '"date"'));
          const children = d.children || [];
          const 工单Items = children.filter(c => {
            const str = JSON.stringify(c);
            return str.includes('工单') || str.includes('补票');
          });
          return { total: children.length, 工单Count: 工单Items.length, samples: 工单Items.slice(0, 5).map(x => x.Description || x.SerialNum) };
        } catch(e) {
          return { raw: text.substring(0, 500), error: e.message };
        }
      } catch(e) {
        return { error: e.message };
      }
    });
    console.log(JSON.stringify(allResult, null, 2));

    // 2. Try work order pool specific API patterns
    console.log('\n===== 2. 尝试工单池API =====');
    const poolApis = [
      '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkOrderPool&_dc=',
      '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetPoolTasks&_dc=',
      '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetUnassignedTasks&_dc=',
      '/YZSoft.Services.REST/BPM/WorkOrder.ashx?method=GetMyList&_dc=',
      '/YZSoft.Services.REST/BPM/WorkOrder.ashx?method=GetAll&_dc=',
      '/YZSoft.Services.REST/BPM/Process.ashx?method=GetMyWorkOrders&_dc=',
    ];

    for (const api of poolApis) {
      const r = await page.evaluate(async (apiUrl) => {
        try {
          const res = await fetch(apiUrl + Date.now(), { credentials: 'include' });
          const text = await res.text();
          return { status: res.status, ok: res.ok, preview: text.substring(0, 150) };
        } catch(e) { return { error: e.message }; }
      }, api);
      if (r.ok && r.status === 200) {
        console.log(`  ✅ ${api}: ${r.preview}`);
      }
    }

    // 3. Check for work order category in post page
    console.log('\n===== 3. 发起流程中的工单分类 =====');
    await page.goto('http://bpm.timesgroup.cn/YZSoft/Forms/Post.aspx?cat=Post-Dichan', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(5000);
    
    const postItems = await page.evaluate(() => {
      const all = [];
      document.querySelectorAll('*').forEach(el => {
        const t = (el.textContent || '').trim();
        if (t.length >= 2 && t.length <= 20) all.push(t);
      });
      return [...new Set(all)].filter(t => t.includes('工单') || t.includes('补票') || t.includes('维修'));
    });
    console.log('工单/补票/维修分类:', postItems.length > 0 ? postItems.join(', ') : '未找到');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await safeClose(browser);
  }
})();
