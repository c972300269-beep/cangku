// 只观察不点击：reload 后每 4s 记录浮层按钮文本，看是否稳定为「立即领取」（=今日未领）还是翻成「今日已领」
const { chromium } = require('playwright');

const BUBBLE_FN = () => {
  const out = { buttons: [], bubbleVisible: false, bubbleClass: null };
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = ((el.className || '') + '').toString();
      if (/daily-checkin/.test(c) && !out.bubbleClass) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { out.bubbleVisible = true; out.bubbleClass = c.slice(0, 90); }
      }
      if (el.tagName === 'BUTTON') {
        const t = (el.innerText || '').replace(/\s+/g, '');
        if (/领取|已领|明日|签到/.test(t)) {
          const r = el.getBoundingClientRect();
          out.buttons.push({ t, r: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
        }
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return out;
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('reload: ' + e.message.split('\n')[0]));
    for (let i = 1; i <= 15; i++) {
      await page.waitForTimeout(4000);
      const s = await page.evaluate(BUBBLE_FN);
      console.log('t=' + (i * 4) + 's visible=' + s.bubbleVisible + ' btns=' + JSON.stringify(s.buttons));
    }
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
