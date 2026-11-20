/**
 * 一次性补签脚本（v5.9.3 浮层按钮文案变为「立即前往」时使用）
 * 流程：连 CDP -> 查服务端（已领则退出0）-> 点「立即前往」打开签到面板 -> 点「立即领取」-> 服务端复核
 * 退出码：0=已领/补签成功  2=未确认成功  1=异常
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(r => setTimeout(r, ms));
const DIR = __dirname;
const LOG = path.join(DIR, 'checkin.log');
const _d = new Date();
const DAY = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0');
const SHOT = path.join(DIR, 'shot_' + DAY + '.png');

function log(...a) {
  const s = '[' + new Date().toLocaleString('zh-CN') + '] ' + a.join(' ');
  console.log(s);
  try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {}
}

const STATUS_FN = async () => {
  try {
    if (!window.wb || !window.wb.http) return { error: 'no window.wb.http' };
    const r = await window.wb.http.post('/billing/meter/checkin-activity-status', {});
    return r && (r.data || r) ? (r.data || r) : { error: 'empty' };
  } catch (e) { return { error: String(e && e.message || e) }; }
};

// 点击文本匹配（放宽：允许 立即前往 / 领取 等）
const CLICK_FN = (texts) => {
  const normalize = s => (s || '').replace(/\s+/g, '');
  const want = texts.map(t => normalize(t));
  const matches = [];
  const isChat = (el) => {
    let e = el, d = 0;
    while (e && d < 8) {
      const c = ((e.className || '') + '').toString();
      if (/cr-|conversation|message|markdown|chat/i.test(c)) return true;
      e = e.parentElement || (e.getRootNode && e.getRootNode().host);
      d++;
    }
    return false;
  };
  const looksClickable = (el) => {
    const c = ((el.className || '') + '').toString();
    if (/fuel|growth|station|bubble|checkin|task/i.test(c)) return true;
    if (el.tagName === 'BUTTON') return true;
    if (el.getAttribute && el.getAttribute('role') === 'button') return true;
    if (typeof getComputedStyle === 'function' && getComputedStyle(el).cursor === 'pointer') return true;
    return false;
  };
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const n = normalize(el.innerText || el.textContent);
      if (!n) continue;
      if (isChat(el) || !looksClickable(el)) continue;
      for (const w of want) {
        if (n.includes(w) && n.length <= w.length + 8) { matches.push({ el, n }); break; }
      }
    }
  };
  walk(document);
  if (!matches.length) return null;
  matches.sort((a, b) => a.n.length - b.n.length);
  for (const m of matches) {
    let e = m.el;
    while (e) {
      const r = e.getBoundingClientRect ? e.getBoundingClientRect() : { width: 1, height: 1 };
      const clickable = e.tagName === 'BUTTON' || (e.getAttribute && e.getAttribute('role') === 'button') ||
        (e.getAttribute && e.getAttribute('tabindex') === '0') ||
        (typeof getComputedStyle === 'function' && getComputedStyle(e).cursor === 'pointer') || !!e.onclick;
      if (clickable && r.width > 0 && r.height > 0) { e.click(); return normalize(m.n); }
      e = e.parentElement || (e.getRootNode && e.getRootNode().host);
    }
    m.el.click();
    return normalize(m.n);
  }
  return null;
};

// 诊断：列出所有含「领取/签到」文本的可点击元素
const DIAG_FN = () => {
  const out = [];
  const walk = (root, depth) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      const n = (el.innerText || el.textContent || '').replace(/\s+/g, '');
      if (n && n.length <= 20 && /领取|签到|礼包/.test(n)) {
        const r = el.getBoundingClientRect();
        out.push({ t: n, tag: el.tagName, cls: ((el.className || '') + '').slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  };
  walk(document, 0);
  return out.slice(0, 40);
};

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = browser.contexts()[0];
    let pages = ctx.pages();
    if (!pages.length) { log('ERROR: 无页面'); process.exit(1); }
    // 选主页面（file:// 开头那个）
    let page = pages.find(p => /WorkBuddy\/resources/.test(p.url())) || pages[0];
    log('已连接 CDP | pages:', pages.length, '| 主页面:', page.url().slice(0, 70), '| frames:', page.frames().length);

    const status = async () => {
      for (const f of page.frames()) {
        try {
          const r = await f.evaluate(STATUS_FN);
          if (r && (r.today_checked_in === true || r.today_checked_in === false)) return r;
        } catch (e) {}
      }
      return null;
    };

    let st = await status();
    if (st && st.today_checked_in === true) {
      log('服务端核验: 今日已领取（连续 ' + st.streak_days + ' 天, 累计 ' + st.total_credits + ' 分）-> 无需操作');
      try { await browser.close(); } catch (e) {}
      process.exit(0);
    }
    log('服务端核验: 今日未领取（连续 ' + (st ? st.streak_days : '?') + ' 天）-> 开始点击');

    const clickAny = async (texts) => {
      const all = [];
      for (const p of ctx.pages()) all.push(p);
      for (const p of all) {
        for (const f of p.frames()) {
          try {
            const r = await f.evaluate(CLICK_FN, texts);
            if (r) return p.url().slice(0, 40) + ' | ' + f.url().slice(0, 40) + ' -> ' + r;
          } catch (e) {}
        }
      }
      return null;
    };

    // 1) 点「立即前往」打开签到面板/加油站
    let r1 = null;
    for (let i = 1; i <= 3 && !r1; i++) {
      r1 = await clickAny(['立即前往', '做任务赢积分好礼', '连续签到']);
      log('第' + i + '次点「立即前往」:', r1 || '未找到');
      if (!r1) await wait(4000);
    }
    await wait(3000);
    log('点击后 pages:', ctx.pages().length, '| 主页面 frames:', page.frames().length);
    ctx.pages().forEach(p => { log('  page:', p.url().slice(0, 100)); p.frames().forEach(f => log('    frame:', f.url().slice(0, 100))); });

    // 2) 面板里点「立即领取」
    let r2 = null;
    for (let i = 1; i <= 4 && !r2; i++) {
      r2 = await clickAny(['立即领取', '领取今日礼包', '领取礼包', '领取', '签到领积分']);
      log('第' + i + '次点「领取」:', r2 || '未找到');
      if (!r2) await wait(3000);
    }
    await wait(3000);

    // 3) 若弹出确认按钮
    const r3 = await clickAny(['确定', '我知道了', '开心收下']);
    if (r3) { log('确认弹窗:', r3); await wait(2000); }

    // 4) 服务端复核
    st = await status();
    if (st && st.today_checked_in === true) {
      log('服务端核验: 今日已领取（连续 ' + st.streak_days + ' 天, 累计 ' + st.total_credits + ' 分）-> 补签成功');
      try { await browser.close(); } catch (e) {}
      process.exit(0);
    }
    log('诊断元素:', JSON.stringify(await (async () => {
      const out = [];
      for (const f of page.frames()) { try { const d = await f.evaluate(DIAG_FN); if (d && d.length) out.push({ f: f.url().slice(0, 40), items: d }); } catch (e) {} }
      return out.slice(0, 3);
    })()));
    try { await page.screenshot({ path: SHOT, timeout: 12000 }); log('已存证截图: ' + SHOT); } catch (e) {}
    log('RESULT: 补签未确认（服务端 today_checked_in=' + (st ? st.today_checked_in : 'null') + '）');
    try { await browser.close(); } catch (e) {}
    process.exit(2);
  } catch (e) {
    log('ERROR:', e.message);
    try { if (browser) await browser.close(); } catch (e2) {}
    process.exit(1);
  }
})();
