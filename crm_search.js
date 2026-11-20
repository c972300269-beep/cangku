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

    // Try different CRM URLs
    const urls = [
      'http://crm.timesgroup.cn',
      'https://crm.timesgroup.cn',
      'http://crm.timesgroup.cn/login',
      'http://timesgroup.xiaoshouyi.com',
      'https://timesgroup.xiaoshouyi.com',
      'http://crm.timesgroup.cn:8080',
      'http://sales.timesgroup.cn',
      'http://service.timesgroup.cn',
    ];

    for (const url of urls) {
      try {
        console.log(`尝试: ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await wait(3000);
        const title = await page.title();
        console.log(`  ✅ 标题: "${title}"`);
        
        // Look for work order / 工单 related elements
        const items = await page.evaluate(() => {
          const found = [];
          document.querySelectorAll('a, span, .menu-item, .nav-item, li, button, div').forEach(el => {
            const t = (el.textContent || '').trim();
            if (t.includes('工单') || t.includes('维修') || t.includes('服务单') || t.includes('报事')) {
              found.push(t);
            }
          });
          return found.slice(0, 10);
        });
        if (items.length > 0) {
          console.log(`  工单相关: ${items.join(' | ')}`);
        }
      } catch(e) {
        console.log(`  ❌ ${e.message.substring(0, 80)}`);
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await safeClose(browser);
  }
})();
