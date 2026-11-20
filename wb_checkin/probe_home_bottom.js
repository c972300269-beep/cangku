// 探测首页主区（右侧 pane）下半部分可见元素
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'probe_home_bottom_out.txt');

const FN = () => {
  const res = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && r.width > 0 && r.height > 0 && r.x >= 280 && r.y >= 360 && r.y <= 690) {
        const cls = (el.className || '').toString().slice(0, 40);
        const txt = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (txt || /fuel|station|gift|bonus|checkin/i.test(cls)) {
          res.push(el.tagName + ' .' + cls + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' | ' + txt);
        }
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(res)].slice(0, 80);
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
      log('### PAGE ' + (await p.title().catch(() => '')));
      for (const f of p.frames()) {
        try { const r = await f.evaluate(FN); if (r.length) { log('--- frame ' + f.url().slice(0, 60)); r.forEach(x => log('  ' + x)); } } catch (e) {}
      }
    }
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== HOMEBOTTOM ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
