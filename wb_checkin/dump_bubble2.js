// 稳定态下完整 dump「daily-checkin」浮层及其祖先/后代文本，判断是否已领
const { chromium } = require('playwright');

const FN = () => {
  const out = [];
  const seen = new Set();
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = ((el.className || '') + '').toString();
      if (/daily-checkin|user-menu|wb-slot--avatar/i.test(c)) {
        const key = c.slice(0, 60) + '|' + el.tagName;
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        const r = el.getBoundingClientRect();
        if (!seen.has(key) && (t || r.width > 0)) {
          seen.add(key);
          out.push(el.tagName + ' .' + c.slice(0, 70) + ' rect=' + [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] + ' | text="' + t.slice(0, 220) + '"');
        }
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return out.slice(0, 25);
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    for (let i = 1; i <= 6; i++) {
      const r = await page.evaluate(FN);
      console.log('===== t=' + (i * 4) + 's =====');
      r.forEach(x => console.log('  ' + x));
      if (i < 6) await page.waitForTimeout(4000);
    }
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
