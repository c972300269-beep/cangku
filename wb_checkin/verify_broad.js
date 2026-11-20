// 宽口径复核：不依赖 fuel 类名，扫全页面+shadow DOM 找积分/已领/加油站 相关文本
const { chromium } = require('playwright');

const FN = () => {
  const res = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const cls = (el.className || '').toString();
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/已领|累计领取|加油站|今日可领|积分|礼包/.test(txt) && txt.length <= 200) {
        res.push('[' + el.tagName + ' .' + cls.slice(0, 50) + '] ' + txt.slice(0, 200));
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(res)].slice(0, 40);
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctxs = browser.contexts();
    console.log('contexts=' + ctxs.length);
    for (const ctx of ctxs) {
      const pages = ctx.pages();
      console.log('pages=' + pages.length);
      for (const p of pages) {
        console.log('PAGE ' + p.url().slice(0, 80));
        for (const f of p.frames()) {
          try {
            const r = await f.evaluate(FN);
            if (r && r.length) { console.log('--- frame ' + f.url().slice(0, 60)); r.forEach(x => console.log('  ' + x)); }
          } catch (e) { console.log('frame err ' + e.message); }
        }
        // localStorage 里的签到态
        try {
          const ls = await p.evaluate(() => {
            const out = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (/checkin|fuel|growth|sign/i.test(k)) out[k] = (localStorage.getItem(k) || '').slice(0, 120);
            }
            return out;
          });
          console.log('LS ' + JSON.stringify(ls));
        } catch (e) { console.log('ls err ' + e.message); }
      }
    }
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
