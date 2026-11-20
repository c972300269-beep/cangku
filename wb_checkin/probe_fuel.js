// 打开「Buddy加油站」卡片，读取 已领天数 / 累计领取 / 期次
const { chromium } = require('playwright');

const DUMP = () => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = ((el.className || '') + '').toString();
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && t && t.length < 200 && /已领|累计|加油站|期|积分|领取|明日/.test(t)) {
        out.push(el.tagName + ' .' + c.slice(0, 50) + ' @' + [Math.round(r.x), Math.round(r.y)] + ' | ' + t);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(out)].slice(0, 40);
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    try { await page.locator('.user-menu-trigger').first().click({ timeout: 15000 }); console.log('[CLICK] avatar'); } catch (e) { console.log('[CLICK] ' + e.message.split('\n')[0]); }
    await page.waitForTimeout(3000);
    try {
      await page.locator('.fuel-menu-entry').first().click({ timeout: 15000 });
      console.log('[CLICK] fuel-menu-entry');
    } catch (e) { console.log('[CLICK] fuel entry: ' + e.message.split('\n')[0]); }
    await page.waitForTimeout(5000);
    console.log('=== after open 加油站 ===');
    (await page.evaluate(DUMP)).forEach(x => console.log('  ' + x));
    try { await page.screenshot({ path: require('path').join(__dirname, 'fuel_2026-10-13.png'), timeout: 15000 }); console.log('[SHOT] saved'); } catch (e) {}
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
