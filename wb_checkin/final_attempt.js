// 最后一搏：hover + click growth-buddy / 胶囊，长等待后 dump 全量页面与「加油站/领取」命中
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'final_attempt_out.txt');
const wait = ms => new Promise(r => setTimeout(r, ms));

const FN = () => {
  const hits = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const cls = (el.className || '').toString();
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (/fuel|加油站|领取|签到|已领|积分好礼|成长空间|做任务/i.test(cls + ' ' + txt) && txt && txt.length <= 140) {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x: -1, y: -1, width: 0, height: 0 };
        hits.push(el.tagName + ' .' + cls.slice(0, 35) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' | ' + txt.slice(0, 90));
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(hits)].slice(0, 50);
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
    const dump = async (tag) => {
      let total = 0;
      let ci = 0;
      for (const ctx of browser.contexts()) {
        ci++;
        let pi = 0;
        for (const p of ctx.pages()) {
          pi++;
          log(tag + ' page' + ci + '-' + pi + ' "' + ((await p.title().catch(() => '')) || '') + '" ' + p.url().slice(0, 70));
          for (const f of p.frames()) {
            try { const r = await f.evaluate(FN); if (r.length) { log(tag + '  frame ' + f.url().slice(0, 60)); r.forEach(x => log(tag + '   ' + x)); total += r.length; } } catch (e) {}
          }
        }
      }
      log(tag + ' 合计命中=' + total);
      return total;
    };
    await dump('[基线]');
    await page.mouse.move(1115, 292);
    await wait(2500);
    await page.mouse.move(1117, 294);
    await wait(2500);
    await dump('[hover buddy]');
    await page.mouse.click(1115, 292);
    await wait(8000);
    await dump('[click buddy]');
    await page.mouse.click(1193, 58);
    await wait(8000);
    await dump('[click capsule]');
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== FINAL ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
