// 探测：整页 innerText 摘要 + 左下角区域元素清单（找被折叠的加油站入口）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'probe_ui2_out.txt');

const FN = () => {
  const out = {};
  out.title = document.title;
  out.bodyText = (document.body && document.body.innerText || '').slice(0, 1500);
  const lows = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && r.width > 0 && r.height > 0 && r.x < 420 && r.y > 380 && r.y < 700) {
        const cls = (el.className || '').toString().slice(0, 45);
        const txt = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        lows.push(el.tagName + ' .' + cls + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' | ' + txt);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  out.bottomLeft = [...new Set(lows)].slice(0, 60);
  return out;
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
      log('### PAGE ' + (await p.title().catch(() => '')) + ' ' + p.url().slice(0, 80));
      for (const f of p.frames()) {
        try {
          const r = await f.evaluate(FN);
          log('--- frame ' + f.url().slice(0, 60));
          log('TITLE: ' + r.title);
          log('BODY: ' + r.bodyText.replace(/\n/g, ' / '));
          log('BOTTOM-LEFT ELEMENTS:'); r.bottomLeft.forEach(x => log('  ' + x));
        } catch (e) { log('  ERR ' + e.message.slice(0, 80)); }
      }
    }
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== PROBE ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
