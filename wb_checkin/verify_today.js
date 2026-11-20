// 复核：确认今日礼包到底是「已领取」还是「待领取（有立即领取按钮）」
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const OUT = path.join(DIR, 'verify_out.txt');

const DONE_FN = () => {
  const re = /^(已签到|今日已领|已领取|领取成功|明日再来|明日可领|今日已签到|已到账)$/;
  const out = [];
  const walk = (root, depth) => {
    for (const el of root.querySelectorAll('*')) {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent || '').join('').replace(/\s+/g, '');
      if (own && own.length <= 12 && re.test(own)) {
        const par = el.parentElement;
        out.push({
          text: own,
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 60),
          parentText: par ? (par.innerText || '').replace(/\s+/g, '').slice(0, 80) : ''
        });
      }
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
    }
  };
  walk(document, 0);
  return out;
};

const SCAN_FN = () => {
  const norm = s => (s || '').replace(/\s+/g, '');
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const n = norm(el.innerText || el.textContent);
      if (n && (n.includes('领取') || n.includes('签到') || n.includes('礼包') || n.includes('积分'))) {
        if (n.length <= 60) out.push(el.tagName + ' | ' + n.slice(0, 60));
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(out)].slice(0, 40);
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const u = p.url() || '';
        const t = (await p.title().catch(() => '')) || '';
        log('=== PAGE', t.slice(0, 40), '|', u.slice(0, 80));
        for (const f of p.frames()) {
          try {
            const done = await f.evaluate(DONE_FN);
            if (done && done.length) log('  [DONE-MARK] frame=' + f.url().slice(0, 70), JSON.stringify(done));
          } catch (e) {}
          try {
            const scan = await f.evaluate(SCAN_FN);
            if (scan && scan.length) {
              log('  [SCAN] frame=' + f.url().slice(0, 70));
              scan.forEach(s => log('    ' + s));
            }
          } catch (e) { log('  [SCAN-ERR]', (e.message || '').split('\n')[0]); }
        }
      }
    }
  } catch (e) {
    log('ERROR: ' + e.message);
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  }
})();
