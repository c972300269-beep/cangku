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

    console.log('[1] 登录 BPM...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(12000);

    // Try to expand menu - click "我要发起流程" -> "主营业务" to see all process categories
    console.log('[2] 尝试打开流程发起页面看是否有工单分类...');
    await page.goto('http://bpm.timesgroup.cn/YZSoft/Forms/Post.aspx?cat=Post-Dichan', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(5000);
    
    const postContent = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('a, span, div, td').forEach(el => {
        const t = el.textContent.trim();
        if (t.includes('工单') || t.includes('补票') || t.includes('维修') || t.includes('池')) {
          items.push(t);
        }
      });
      return items;
    });
    console.log('发起流程页面中"工单/补票/维修/池"相关:', postContent.join(' | ') || '无');

    // Try CRM 
    console.log('\n[3] 尝试CRM系统...');
    try {
      await page.goto('https://crm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await wait(5000);
      const crmTitle = await page.title();
      console.log('CRM标题:', crmTitle);
      const crmItems = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('a, span, .menu-item, .nav-item, li').forEach(el => {
          const t = el.textContent.trim();
          if (t.includes('工单') || t.includes('维修') || t.includes('服务')) {
            items.push(t);
          }
        });
        return items;
      });
      console.log('CRM中工单相关:', crmItems.join(' | ') || '无');
    } catch(e) {
      console.log('CRM无法访问:', e.message.substring(0, 80));
    }

    // Try searching BPM all-accessible processes for 工单
    console.log('\n[4] 在BPM流程查询中搜索工单...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(8000);
    
    // Search for 工单 in all accessible 
    const result = await page.evaluate(async () => {
      try {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetAllAccessable&start=0&limit=100&_dc=' + Date.now(), { credentials: 'include' });
        const text = await r.text();
        return text.substring(0, 1000);
      } catch(e) {
        return 'API error: ' + e.message;
      }
    });
    console.log('流程查询API结果:', result);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await safeClose(browser);
  }
})();
