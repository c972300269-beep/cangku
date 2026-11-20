// 探测 renderer 本地存储中是否有加油站/积分相关信息（判断今日是否已领 / 组件数据是否加载）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'storage_out.txt');

const FN = () => {
  const out = { keys: [], hits: [], globals: [] };
  const scan = (store, name) => {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        out.keys.push(name + ':' + k);
        if (/fuel|credit|sign|checkin|point|score|reward|gift|station/i.test(k)) {
          let v = '';
          try { v = (store.getItem(k) || '').slice(0, 400); } catch (e) {}
          out.hits.push(name + ' ' + k + ' = ' + v);
        }
      }
    } catch (e) { out.hits.push(name + ' ERR ' + e.message); }
  };
  try { scan(localStorage, 'LS'); } catch (e) { out.hits.push('LS ERR ' + e.message); }
  try { scan(sessionStorage, 'SS'); } catch (e) { out.hits.push('SS ERR ' + e.message); }
  try {
    for (const k of Object.keys(window)) {
      if (/fuel|credit|station|gift/i.test(k)) out.globals.push(k + ' = ' + String(window[k]).slice(0, 120));
    }
  } catch (e) {}
  return out;
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
        try {
          const r = await f.evaluate(FN);
          log('--- frame ' + f.url().slice(0, 60) + ' storage keys=' + r.keys.length);
          log('  KEYS: ' + r.keys.slice(0, 80).join(' | '));
          r.hits.forEach(x => log('  HIT ' + x));
          r.globals.forEach(x => log('  GLOBAL ' + x));
        } catch (e) { log('  ERR ' + e.message.slice(0, 100)); }
      }
    }
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== STORAGE ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
