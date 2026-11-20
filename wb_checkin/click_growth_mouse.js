// 用真实鼠标点击「做任务赢积分好礼」胶囊 / growth-buddy，随后 dump 新出现的页面与文本
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'growth_mouse_out.txt');
const wait = ms => new Promise(r => setTimeout(r, ms));

const DUMP_TEXT = () => {
  const t = (document.body && document.body.innerText || '').replace(/\s+/g, ' ');
  const hits = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (txt && txt.length <= 140 && /领取|签到|加油站|已领|连续签到/.test(txt)) {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x: -1, y: -1, width: 0, height: 0 };
        if (r.width > 0 && r.height > 0) hits.push(el.tagName + ' .' + (el.className || '').toString().slice(0, 35) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + ' | ' + txt.slice(0, 100));
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return { head: t.slice(0, 400), hits: [...new Set(hits)].slice(0, 40) };
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = '[' + new Date().toLocaleString('zh-CN') + '] ' + a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    let page = null;
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) { if (/WorkBuddy|app\.asar|file:/i.test(((await p.title().catch(() => '')) || '') + p.url())) { page = p; break; } if (page) break; }
    if (!page) { log('NO PAGE'); return; }
    const dumpAll = async (tag) => {
      for (const ctx of browser.contexts()) {
        let pi = 0;
        for (const p of ctx.pages()) {
          pi++;
          log(tag + ' ### page' + pi + ' "' + ((await p.title().catch(() => '')) || '') + '" ' + p.url().slice(0, 90));
          for (const f of p.frames()) {
            try {
              const r = await f.evaluate(DUMP_TEXT);
              log(tag + '   frame ' + f.url().slice(0, 70));
              log(tag + '   HEAD: ' + r.head.slice(0, 250));
              r.hits.forEach(x => log(tag + '   HIT ' + x));
            } catch (e) { log(tag + '   ERR ' + e.message.slice(0, 50)); }
          }
        }
      }
    };
    // 1) 真实点击胶囊
    await page.mouse.click(1193, 58);
    log('已真实点击胶囊 (1193,58)');
    await wait(6000);
    await dumpAll('[胶囊]');
    // 2) 真实点击 growth-buddy 挂件
    await page.mouse.click(1115, 292);
    log('已真实点击 growth-buddy (1115,292)');
    await wait(6000);
    await dumpAll('[buddy]');
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== GROWTHMOUSE ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
