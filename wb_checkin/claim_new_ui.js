/**
 * 新 UI 适配（2026-10-13）：旧 .fuel-station 浮层已下线，
 * 现为 .daily-checkin.daily-checkin--bubble（shadow DOM，锚定左下角头像菜单）。
 * 用 Playwright locator（自动穿透 shadow DOM）做真实鼠标点击，并在点击前后对比状态。
 */
const { chromium } = require('playwright');

const STATE_FN = () => {
  let txt = null, btn = null, cls = '';
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = ((el.className || '') + '').toString();
      if (/daily-checkin/.test(c)) {
        cls = c;
        txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  // 找按钮文本
  const btnWalk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const t = (el.innerText || el.textContent || '').replace(/\s+/g, '').trim();
      if (el.tagName === 'BUTTON' && /立即领取|今日已领|已领取|已签到|明日/.test(t)) { btn = t; return; }
      if (el.shadowRoot && btnWalk(el.shadowRoot)) return true;
    }
    return false;
  };
  btnWalk(document);
  return { cls, bubbleText: txt, btnText: btn };
};

(async () => {
  let browser = null;
  const dump = (tag, s) => console.log('[' + tag + '] ' + JSON.stringify(s));
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];

    dump('BEFORE', await page.evaluate(STATE_FN));

    // Playwright CSS 自动穿透 shadow DOM
    const btn = page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').first();
    let count = 0;
    try { count = await page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').count(); } catch (e) {}
    console.log('[BTN] matched=' + count);

    if (count > 0) {
      try {
        await btn.click({ timeout: 15000 });   // 真实鼠标点击（trusted event）
        console.log('[CLICK] ok');
      } catch (e) {
        console.log('[CLICK] locator failed: ' + e.message.split('\n')[0] + ' -> fallback JS click');
        try {
          await page.evaluate(() => {
            const walk = (root) => {
              for (const el of root.querySelectorAll('*')) {
                const t = (el.innerText || el.textContent || '').replace(/\s+/g, '');
                if (el.tagName === 'BUTTON' && t.includes('立即领取')) { el.click(); return true; }
                if (el.shadowRoot && walk(el.shadowRoot)) return true;
              }
              return false;
            };
            return walk(document);
          });
          console.log('[CLICK] js fallback ok');
        } catch (e2) { console.log('[CLICK] fallback err ' + e2.message); }
      }
    }

    await page.waitForTimeout(4000);
    dump('AFTER', await page.evaluate(STATE_FN));

    // 兜底：若仍显示「立即领取」，点第二次再确认
    const after = await page.evaluate(STATE_FN);
    if (after.btnText && /立即领取/.test(after.btnText)) {
      console.log('[RETRY] 仍为立即领取，再点一次');
      try { await btn.click({ timeout: 15000 }); } catch (e) { console.log('[RETRY] ' + e.message.split('\n')[0]); }
      await page.waitForTimeout(4000);
      dump('AFTER2', await page.evaluate(STATE_FN));
    }

    try { await page.screenshot({ path: require('path').join(__dirname, 'claim_2026-10-13.png'), timeout: 15000 }); console.log('[SHOT] saved'); }
    catch (e) { console.log('[SHOT] ' + e.message.split('\n')[0]); }
  } catch (e) {
    console.log('ERROR ' + e.message);
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
})();
