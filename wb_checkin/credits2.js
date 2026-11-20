/**
 * 点开左下角头像菜单，读取账户积分余额（只读+1次受控点击，读完关闭）
 * 安全约束：只点文本精确匹配 "CJL" 的最小元素，绝不点其他按钮
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const OUT = path.join(__dirname, 'credits_menu.txt');
const wait = ms => new Promise(r => setTimeout(r, ms));

const FIND_AND_CLICK = (label) => {
  let best = null;
  const walk = (root, depth) => {
    if (depth > 25) return;
    for (const el of root.children || []) {
      let own = '';
      for (const n of el.childNodes || []) if (n.nodeType === 3) own += (n.textContent || '');
      const t = (own || '').replace(/\s+/g, ' ').trim();
      if (t && label.test(t) && (!best || (el.textContent || '').length < (best.textContent || '').length)) best = el;
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      walk(el, depth + 1);
    }
  };
  walk(document, 0);
  if (best) { best.click(); return (best.textContent || '').trim().slice(0, 40); }
  return null;
};

const DUMP_FN = (limit) => {
  let s = '';
  const SKIP = new Set(['script', 'style', 'template', 'noscript', 'svg', 'path', 'link']);
  const walk = (root, depth) => {
    if (depth > 25 || s.length > limit) return;
    for (const el of root.children || []) {
      const tag = (el.tagName || '').toLowerCase();
      if (SKIP.has(tag)) continue;
      let own = '';
      for (const n of el.childNodes || []) if (n.nodeType === 3) own += (n.textContent || '');
      const t = (own || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 120 && !/[{};]\s*$/.test(t)) s += t + '\n';
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      walk(el, depth + 1);
    }
  };
  walk(document.body || document.documentElement, 0);
  return s.slice(0, limit);
};

(async () => {
  let browser = null;
  const out = [];
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT);
    let page = null;
    outer: for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const u = p.url() || '';
        if (u.includes('app.asar') || u.startsWith('file://')) { page = p; break outer; }
      }
    }
    if (!page) throw new Error('未找到主页面');

    const clicked = await page.evaluate(FIND_AND_CLICK, /^CJL/);
    out.push('clicked: ' + clicked);
    await wait(2500);

    for (const f of page.frames()) {
      try {
        const t = await f.evaluate(DUMP_FN, 4000);
        if (t && t.trim()) out.push('--- frame: ' + f.url().slice(0, 60) + ' ---\n' + t);
      } catch (e) {}
    }

    // 关闭菜单
    try { await page.keyboard.press('Escape'); } catch (e) {}
    await wait(500);

    fs.writeFileSync(OUT, out.join('\n'), 'utf8');
    console.log('WROTE ' + OUT);
  } catch (e) {
    fs.writeFileSync(OUT, out.join('\n') + '\nERR ' + e.message, 'utf8');
    console.log('ERR ' + e.message);
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();
