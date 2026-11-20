/**
 * 只读 dump WorkBuddy 界面文字（含 shadow DOM），用于定位积分余额等信息
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const OUT = path.join(__dirname, 'dump_text.txt');

const DUMP_FN = (limit) => {
  let s = '';
  const SKIP = new Set(['script', 'style', 'template', 'noscript', 'svg', 'path', 'link']);
  const walk = (root, depth) => {
    if (depth > 25 || s.length > limit) return;
    for (const el of root.children || []) {
      const tag = (el.tagName || '').toLowerCase();
      if (SKIP.has(tag)) continue;
      let own = '';
      for (const n of el.childNodes || []) {
        if (n.nodeType === 3) own += (n.textContent || '');
      }
      const t = (own || '').replace(/\s+/g, ' ').trim();
      // 过滤 CSS/代码样式的长文本
      if (t && t.length < 120 && !/[{};]\s*$/.test(t) && !t.includes('@media')) s += t + '\n';
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      walk(el, depth + 1);
    }
  };
  walk(document.body || document.documentElement, 0);
  return s.slice(0, limit);
};

(async () => {
  let browser = null;
  const chunks = [];
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT);
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const u = p.url() || '';
        if (!u.includes('app.asar') && !u.startsWith('file://')) continue;
        chunks.push('\n===== PAGE: ' + u.slice(0, 80) + ' =====');
        for (const f of p.frames()) {
          try {
            const txt = await f.evaluate(DUMP_FN, 6000);
            if (txt && txt.trim()) chunks.push('--- frame: ' + f.url().slice(0, 70) + ' ---\n' + txt);
          } catch (e) {
            chunks.push('--- frame err: ' + e.message.slice(0, 80));
          }
        }
      }
    }
    fs.writeFileSync(OUT, chunks.join('\n'), 'utf8');
    console.log('WROTE ' + OUT);
  } catch (e) {
    fs.writeFileSync(OUT, 'ERR ' + e.message, 'utf8');
    console.log('ERR ' + e.message);
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();
