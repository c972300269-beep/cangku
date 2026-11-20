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

    // Get full module tree
    console.log('[2] 模块树内容...');
    const modulesRaw = await page.evaluate(async () => {
      const r = await fetch('/BPM2018/Modules/BPM.ashx?method=GetModuleTree', { credentials: 'include' });
      return await r.text();
    });
    console.log(modulesRaw.substring(0, 3000));

    // Get page title to confirm logged in
    const title = await page.title();
    console.log('\n页面标题:', title);

    // Try to get any navigation menu items visible
    console.log('\n[3] 获取页面可见菜单...');
    const menuItems = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('.x-menu-item-text, .x-btn-text, .x-tab-strip-text, a, .menu-text').forEach(el => {
        const t = el.textContent.trim();
        if (t && t.length > 1 && t.length < 30) items.push(t);
      });
      return [...new Set(items)];
    });
    console.log('可见菜单项:', menuItems.join(' | '));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await safeClose(browser);
  }
})();
