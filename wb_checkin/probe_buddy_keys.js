// 读取与 Buddy加油站/签到气泡 相关的本地存储键值全文
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'buddy_keys_out.txt');

const FN = () => {
  const out = [];
  const push = (k, v) => out.push(k + ' = ' + (v === null ? '<null>' : v));
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/buddy|checkin|growth|bubble|fuel|Entrance|Flag/i.test(k)) {
      let v = '';
      try { v = localStorage.getItem(k) || ''; } catch (e) { v = 'ERR ' + e.message; }
      push(k, v.length > 1500 ? v.slice(0, 1500) + ' ...[len=' + v.length + ']' : v);
    }
  }
  return out;
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) {
      for (const f of p.frames()) {
        try { const r = await f.evaluate(FN); if (r.length) { log('--- frame ' + f.url().slice(0, 60)); r.forEach(x => log('  ' + x)); } } catch (e) {}
      }
    }
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== BUDDYKEYS ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
