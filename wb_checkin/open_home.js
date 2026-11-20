// 尝试回到首页/新建任务页，让 Buddy加油站 浮层出现，然后精准点击「立即领取」
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'home_out.txt');
const wait = ms => new Promise(r => setTimeout(r, ms));

// 精准定位：BUTTON（或 class 含 fuel-btn）且「自身直接文本」等于目标词
const CLICK_EXACT = (words) => {
  const norm = s => (s || '').replace(/\s+/g, '');
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent || '').join('');
      const n = norm(own);
      if (!n || n.length > 10) continue;
      if (!words.includes(n)) continue;
      const isBtn = el.tagName === 'BUTTON' || norm(el.className || '').includes('fuel-btn') ||
        el.getAttribute && el.getAttribute('role') === 'button';
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
      if (isBtn && r.width > 0 && r.height > 0) { el.click(); return norm(el.className || '') + '|' + n; }
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
      if (/fuel|加油站|礼包|station/i.test(cls + ' ' + txt) && txt.length <= 200) {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { x: -1, y: -1, width: 0, height: 0 };
        res.push('[' + el.tagName + ' .' + cls.slice(0, 40) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + '] ' + txt.slice(0, 120));
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(res)].slice(0, 30);
};

const DONE_FN = () => {
  const re = /^(已签到|今日已领|已领取|领取成功|明日再来|明日可领|今日已签到|已到账)$/;
  let hit = false;
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (hit) return;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent || '').join('').replace(/\s+/g, '');
      if (own && own.length <= 12 && re.test(own)) { hit = true; return; }
    }
  };
  walk(document);
  return hit;
};

(async () => {
  const lines = [];
  const log = (...a) => { const s = '[' + new Date().toLocaleString('zh-CN') + '] ' + a.join(' '); console.log(s); lines.push(s); };
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    let page = null;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const t = (await p.title().catch(() => '')) || '';
        if (/WorkBuddy|app\.asar|file:/i.test(t + p.url())) { page = p; break; }
      }
      if (page) break;
    }
    if (!page) { log('NO PAGE'); return; }

    const isDone = async () => { for (const f of page.frames()) { try { if (await f.evaluate(DONE_FN)) return true; } catch (e) {} } return false; };
    const dumpAll = async () => {
      const out = [];
      for (const f of page.frames()) { try { const r = await f.evaluate(DUMP); if (r && r.length) out.push('--- ' + f.url().slice(0, 50)), out.push(...r.map(x => '  ' + x)); } catch (e) {} }
      out.forEach(x => log(x));
      return out.join('\n');
    };
    const clickExact = async (words) => {
      for (const f of page.frames()) { try { const r = await f.evaluate(CLICK_EXACT, words); if (r) return f.url().slice(0, 50) + ' -> ' + r; } catch (e) {} }
      return null;
    };

    log('=== 初始状态 ===');
    await dumpAll();
    log('isDone(初始)=' + (await isDone()));

    // 1) 回首页：点「新建任务」
    const home = await clickExact(['新建任务']);
    log('点击新建任务: ' + (home || '未找到'));
    await wait(5000);
    log('=== 回首页后 ===');
    await dumpAll();

    // 2) 浮层出现则点击「立即领取」
    if (!(await isDone())) {
      for (let i = 1; i <= 3; i++) {
        const c = await clickExact(['立即领取', '领取']);
        log('第' + i + '次精准点击立即领取: ' + (c || '未找到'));
        if (c) break;
        await wait(5000);
        await dumpAll();
      }
      await wait(3000);
    }
    log('=== 点击后 ===');
    await dumpAll();
    const done = await isDone();
    log('FINAL isDone=' + done);
  } catch (e) { log('ERROR ' + e.message); }
  finally {
    try { if (browser) await browser.close(); } catch (e) {}
    fs.appendFileSync(OUT, '\n===== HOME ' + new Date().toLocaleString('zh-CN') + ' =====\n' + lines.join('\n'), 'utf8');
  }
})();
