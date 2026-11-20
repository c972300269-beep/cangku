// 定位「立即领取」元素：打印祖先链 + 位置，区分"真浮层"还是"聊天区里的历史文本"
const { chromium } = require('playwright');

const FN = () => {
  const out = [];
  const walk = (root, depth, chain) => {
    for (const el of root.querySelectorAll('*')) {
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/立即领取/.test(txt) && txt.length <= 200) {
        const c = [];
        let p = el;
        for (let i = 0; i < 6 && p; i++) {
          c.push(p.tagName + (p.className ? '.' + String(p.className).slice(0, 45) : ''));
          p = p.parentElement || (p.getRootNode() && p.getRootNode().host) || null;
        }
        const host = el.getRootNode();
        const r = el.getBoundingClientRect();
        out.push({
          text: txt.slice(0, 120),
          inShadow: !!(host && host.host),
          shadowHost: (host && host.host) ? host.host.tagName + '.' + String(host.host.className).slice(0, 40) : '',
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          chain: c.join(' < ')
        });
      }
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1, chain);
    }
  };
  walk(document, 0, []);
  // 是否还有 .fuel-station 浮层
  const fs = document.querySelector('.fuel-station');
  return {
    hits: out.slice(0, 12),
    fuelStation: fs ? (fs.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) : null,
    viewport: [window.innerWidth, window.innerHeight]
  };
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const r = await p.frames()[0].evaluate(FN);
        console.log(JSON.stringify(r, null, 2));
      }
    }
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
