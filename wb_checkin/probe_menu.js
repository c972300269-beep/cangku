// 点开头像用户菜单，找「积分/已领/加油站」入口与数值
const { chromium } = require('playwright');

const DUMP = () => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const c = ((el.className || '') + '').toString();
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && t && t.length < 120 && /积分|已领|加油站|成长|礼包|领取|签到/.test(t)) {
        out.push(el.tagName + ' .' + c.slice(0, 45) + ' @' + [Math.round(r.x), Math.round(r.y)] + ' | ' + t);
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
    console.log('--- click avatar ---');
    try {
      await page.locator('.user-menu-trigger').first().click({ timeout: 15000 });
      console.log('[CLICK] avatar ok');
    } catch (e) { console.log('[CLICK] ' + e.message.split('\n')[0]); }
    await page.waitForTimeout(4000);
    console.log('=== menu text ===');
    (await page.evaluate(DUMP)).forEach(x => console.log('  ' + x));
    try { await page.screenshot({ path: require('path').join(__dirname, 'menu_2026-10-13.png'), timeout: 15000 }); console.log('[SHOT] saved'); } catch (e) {}
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
