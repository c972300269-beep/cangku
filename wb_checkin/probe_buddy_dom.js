// 找 Buddy 挂件（growth-buddy）/ 签到气泡：dump 匹配 buddy|growth|bubble 的元素 + 鼠标悬停左下角试探
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'buddy_dom_out.txt');
const wait = ms => new Promise(r => setTimeout(r, ms));

const FN = () => {
  const res = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const cls = (el.className || '').toString();
      const id = (el.id || '').toString();
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (/buddy|growth|bubble|fuel/i.test(cls + ' ' + id) || /加油|签到|Buddy加油站/.test(txt)) {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x: -1, y: -1, width: 0, height: 0 };
        res.push(el.tagName + '#' + id.slice(0, 20) + ' .' + cls.slice(0, 45) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) +
          ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' | ' + txt);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(res)].slice(0, 40);
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = '[' + new Date().toLocaleString('zh-CN') + '] ' + a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    let page = null;
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) { if (/WorkBuddy|app\.asar|file:/i.test(((await p.title().catch(() => '')) || '') + p.url())) { page = p; break; } }
    if (!page) { log('NO PAGE'); return; }
    const dump = async (tag) => {
      let n = 0;
      for (const f of page.frames()) {
        try { const r = await f.evaluate(FN); if (r.length) { log(tag + ' frame ' + f.url().slice(0, 50)); r.forEach(x => log('   ' + x)); n += r.length; } } catch (e) {}
      }
      log(tag + ' 命中数=' + n);
      return n;
    };
    await dump('[初始]');
    // 试探：鼠标移到左下角区域，看是否有 hover 出来的浮层
    for (const [x, y] of [[40, 600], [150, 640], [300, 640], [60, 500]]) {
      try { await page.mouse.move(x, y); } catch (e) {}
      await wait(1500);
      await dump('[hover ' + x + ',' + y + ']');
    }
    await wait(20000);
    await dump('[等待20s后]');
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== BUDDYDOM ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
