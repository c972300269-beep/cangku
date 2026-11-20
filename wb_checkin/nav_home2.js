// 放宽匹配：点击任意「自身直接文本」等于目标词的可见元素（不限 tag），回首页后 dump 加油站
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'nav_home_out.txt');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CLICK_TEXT = (words) => {
  const norm = s => (s || '').replace(/\s+/g, '');
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent || '').join('');
      const n = norm(own);
      if (!n || !words.includes(n)) continue;
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0, x: 0, y: 0 };
      if (r.width > 0 && r.height > 0) { el.click(); return el.tagName + '.' + norm(el.className || '').slice(0, 30) + '|' + n + '@' + Math.round(r.x) + ',' + Math.round(r.y); }
    }
  };
  walk(document);
  return null;
};

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
  const log = (...a) => { const s = '[' + new Date().toLocaleString('zh-CN') + '] ' + a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    let page = null;
    for (const ctx of browser.contexts()) { for (const p of ctx.pages()) { if (/WorkBuddy|app\.asar|file:/i.test(((await p.title().catch(() => '')) || '') + p.url())) { page = p; break; } } if (page) break; }
    if (!page) { log('NO PAGE'); return; }
    const dumpAll = async () => {
      const out = [];
      for (const f of page.frames()) { try { const r = await f.evaluate(DUMP); if (r && r.length) { out.push('  frame ' + f.url().slice(0, 60)); r.forEach(x => out.push('    ' + x)); } } catch (e) {} }
      out.forEach(x => log(x));
      return out.length;
    };
    const clickText = async (words) => {
      for (const f of page.frames()) { try { const r = await f.evaluate(CLICK_TEXT, words); if (r) return f.url().slice(0, 40) + ' -> ' + r; } catch (e) {} }
      return null;
    };

    for (const w of ['新建任务', '发现应用', '灵感']) {
      const c = await clickText([w]);
      log('点击[' + w + ']: ' + (c || '未找到'));
      await wait(6000);
      const n = await dumpAll();
      log('  -> 加油站元素数=' + n);
      if (n > 0) break;
    }
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== NAV ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
