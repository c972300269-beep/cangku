// 复核 2：完整 dump Buddy加油站 浮层文本，判断期次起止与已领天数
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'verify_out.txt');

const DUMP_FN = () => {
  const res = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const cls = (el.className || '').toString();
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/fuel|加油站|礼包|station/i.test(cls + ' ' + txt) && txt && txt.length <= 300) {
        res.push('[' + el.tagName + ' .' + cls.slice(0, 40) + '] ' + txt.slice(0, 300));
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(res)].slice(0, 30);
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        for (const f of p.frames()) {
          try {
            const r = await f.evaluate(DUMP_FN);
            if (r && r.length) { log('--- frame ' + f.url().slice(0, 60)); r.forEach(x => log('  ' + x)); }
          } catch (e) {}
        }
      }
    }
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== DUMP2 ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
