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

  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();

  try {
    await page.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Get all input elements
    const inputs = await page.evaluate(() => {
      const els = document.querySelectorAll('input');
      return Array.from(els).map(e => ({
        type: e.type,
        name: e.name,
        placeholder: e.placeholder,
        className: e.className.substring(0, 50)
      }));
    });
    console.log('Inputs:', JSON.stringify(inputs, null, 2));

    // Get buttons
    const buttons = await page.evaluate(() => {
      const els = document.querySelectorAll('button');
      return Array.from(els).map(e => ({
        text: e.textContent.trim().substring(0, 30),
        className: e.className.substring(0, 50)
      }));
    });
    console.log('Buttons:', JSON.stringify(buttons, null, 2));

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    await safeClose(browser);
  }
})();
