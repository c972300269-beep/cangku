// 打开用户菜单里的「成长计划」，查找签到日历/连登天数等权威记录
const { chromium } = require('playwright');

const DUMP = () => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = ((el.className || '') + '').toString();
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && t && t.length < 250 && /已领|累计|连登|连续|天|积分|领取|明日|签到|加油站|期/.test(t)) {
        out.push(el.tagName + ' .' + c.slice(0, 50) + ' @' + [Math.round(r.x), Math.round(r.y)] + ' | ' + t);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(out)].slice(0, 45);
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    try { await page.locator('.user-menu-trigger').first().click({ timeout: 12000 }); console.log('[CLICK] avatar'); } catch (e) { console.log('[CLICK] avatar err'); }
    await page.waitForTimeout(2500);
    // 尝试各种入口
    const cands = ['.growth-content', '.fuel-menu-entry', '.user-menu-billing-cell'];
    for (const sel of cands) {
      try {
        const n = await page.locator(sel).count();
        console.log('cand ' + sel + ' count=' + n);
        if (n > 0) {
          await page.locator(sel).first().click({ timeout: 6000 });
          console.log('[CLICK] ' + sel + ' ok');
          await page.waitForTimeout(4000);
          console.log('--- dump after ' + sel + ' ---');
          (await page.evaluate(DUMP)).forEach(x => console.log('  ' + x));
          try { await page.screenshot({ path: require('path').join(__dirname, 'growth_' + sel.replace(/\W/g, '') + '.png'), timeout: 15000 }); console.log('[SHOT] ' + sel); } catch (e) {}
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(1500);
        }
      } catch (e) { console.log('[CLICK] ' + sel + ' err ' + e.message.split('\n')[0]); }
    }
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
