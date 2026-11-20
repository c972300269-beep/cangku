// 新入口：点击「做任务赢积分好礼」growth capsule / growth-buddy，查看成长空间中是否有签到领取
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'growth_out.txt');
const wait = ms => new Promise(r => setTimeout(r, ms));

const CLICK_SEL = () => {
  const sels = ['.growth-capsule', '.growth-capsule__text', '.wb-slot--home-growth', '.wb-home-route__growth-buddy'];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) { el.click(); return s + ' @' + Math.round(r.x) + ',' + Math.round(r.y); }
    }
  }
  return null;
};

const DUMP_TEXT = () => {
  const t = (document.body && document.body.innerText || '').replace(/\s+/g, ' ');
  const hits = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (txt && txt.length <= 120 && /领取|签到|积分|加油站|已领/.test(txt)) {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x: -1, y: -1, width: 0, height: 0 };
        if (r.width > 0 && r.height > 0) hits.push(el.tagName + ' .' + (el.className || '').toString().slice(0, 35) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + ' | ' + txt);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return { head: t.slice(0, 600), hits: [...new Set(hits)].slice(0, 40) };
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = '[' + new Date().toLocaleString('zh-CN') + '] ' + a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const dumpAll = async (tag) => {
      let ci = 0;
      for (const ctx of browser.contexts()) {
        ci++;
        let pi = 0;
        for (const p of ctx.pages()) {
          pi++;
          const t = (await p.title().catch(() => '')) || '';
          log(tag + ' ### ctx' + ci + ' page' + pi + ' "' + t + '" ' + p.url().slice(0, 90));
          for (const f of p.frames()) {
            try {
              const r = await f.evaluate(DUMP_TEXT);
              log(tag + '   frame ' + f.url().slice(0, 70));
              log(tag + '   HEAD: ' + r.head.slice(0, 300));
              r.hits.forEach(x => log(tag + '   HIT ' + x));
            } catch (e) { log(tag + '   ERR ' + e.message.slice(0, 60)); }
          }
        }
      }
    };
    let page = null;
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) { if (/WorkBuddy|app\.asar|file:/i.test(((await p.title().catch(() => '')) || '') + p.url())) { page = p; break; } if (page) break; }
    if (!page) { log('NO PAGE'); return; }

    const c = await page.evaluate(CLICK_SEL).catch(e => 'ERR ' + e.message);
    log('点击成长入口: ' + (c || '未找到'));
    await wait(6000);
    await dumpAll('[点击后]');
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== GROWTH ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
