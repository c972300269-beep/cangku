/**
 * 读取 WorkBuddy 当前积分余额（只读，不点击任何元素）
 * 通过 CDP 连接 9222 端口，深度遍历 shadow DOM 找含"积分"的文本
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const OUT = path.join(__dirname, 'credits.json');

// 深度遍历 shadow DOM，收集含关键词的直接文本节点
const SCAN_FN = () => {
  const hits = [];
  const walk = (root, depth) => {
    if (depth > 25) return;
    for (const el of root.children || []) {
      // 只看"直接子文本节点"，避免把整个大容器抓进来
      let own = '';
      for (const n of el.childNodes || []) {
        if (n.nodeType === 3) own += (n.textContent || '');
      }
      const t = (own || '').replace(/\s+/g, ' ').trim();
      const cls = typeof el.className === 'string' ? el.className : '';
      if (t && t.length < 80 && /积分|余额|Credits|credits/.test(t)) {
        hits.push({ text: t, tag: (el.tagName || '').toLowerCase(), cls: cls.slice(0, 60) });
      }
      // 积分相关的容器（fuel / credit / point / score / balance），整体输出文本
      if (/fuel|credit|point|score|balance/i.test(cls) && el.textContent) {
        const whole = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (whole && whole.length < 200) {
          hits.push({ text: '[容器] ' + whole, tag: (el.tagName || '').toLowerCase(), cls: cls.slice(0, 60) });
        }
      }
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      walk(el, depth + 1);
    }
  };
  walk(document, 0);
  return hits;
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT);
    let page = null;
    outer: for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const t = (await p.title().catch(() => '')) || '';
        const u = p.url() || '';
        if (t.includes('WorkBuddy') || u.includes('app.asar') || u.startsWith('file://')) { page = p; break outer; }
      }
    }
    if (!page) throw new Error('未找到 WorkBuddy 主页面');

    const all = [];
    for (const f of page.frames()) {
      try {
        const hits = await f.evaluate(SCAN_FN);
        if (hits && hits.length) all.push({ frame: f.url().slice(0, 80), hits });
      } catch (e) {}
    }

    fs.writeFileSync(OUT, JSON.stringify({ time: new Date().toISOString(), frames: all }, null, 2), 'utf8');
    console.log('WROTE ' + OUT);
  } catch (e) {
    fs.writeFileSync(OUT, JSON.stringify({ time: new Date().toISOString(), error: e.message }, null, 2), 'utf8');
    console.log('ERR ' + e.message);
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();
