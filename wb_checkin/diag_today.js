// 诊断：主页面内是否存在加油站浮层/入口；不存在则 dump 左下角区域可点元素
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'diag_out.txt');

const FN = () => {
  const res = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const cls = (el.className || '').toString();
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/fuel|加油|礼包|签到|积分|station/i.test(cls + ' ' + txt)) {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x: -1, y: -1, width: 0, height: 0 };
        res.push('[' + el.tagName + ' .' + cls.slice(0, 50) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) +
          ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' + txt.slice(0, 120));
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(res)].slice(0, 60);
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (!/WorkBuddy|app\.asar|file:/i.test((p.url() || '') + (await p.title().catch(() => '')))) continue;
        log('=== PAGE ' + (await p.title().catch(() => '')) + ' | ' + p.url().slice(0, 80));
        for (const f of p.frames()) {
          try {
            const r = await f.evaluate(FN);
            if (r && r.length) { log('--- frame ' + f.url().slice(0, 60)); r.forEach(x => log('  ' + x)); }
          } catch (e) { log('  frame err ' + e.message); }
        }
      }
    }
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== DIAG ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
