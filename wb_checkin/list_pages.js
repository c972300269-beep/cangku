// 枚举全部 contexts/pages/frames，逐个 dump 加油站相关元素，定位浮层到底在哪个页面
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'pages_out.txt');

const DUMP = () => {
  const res = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const cls = (el.className || '').toString();
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/fuel|加油站|礼包|station/i.test(cls + ' ' + txt) && txt.length <= 200) res.push('[' + el.tagName + ' .' + cls.slice(0, 40) + '] ' + txt.slice(0, 120));
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(res)].slice(0, 25);
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    let ci = 0;
    for (const ctx of browser.contexts()) {
      ci++;
      let pi = 0;
      for (const p of ctx.pages()) {
        pi++;
        const t = (await p.title().catch(() => '')) || '';
        log('### ctx' + ci + ' page' + pi + ' title="' + t + '" url=' + p.url().slice(0, 100));
        for (const f of p.frames()) {
          try {
            const r = await f.evaluate(DUMP);
            if (r && r.length) { log('   frame ' + f.url().slice(0, 80)); r.forEach(x => log('     ' + x)); }
          } catch (e) { log('   frame ' + f.url().slice(0, 60) + ' ERR ' + e.message.slice(0, 60)); }
        }
      }
    }
    log('总页面数=' + browser.contexts().reduce((n, c) => n + c.pages().length, 0));
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== PAGES ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
