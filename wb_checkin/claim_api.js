/**
 * API 直签兜底（2026-11-05）：浮层按钮点不到时，直接在渲染进程调
 * POST /billing/meter/daily-checkin（与 UI「立即领取」按钮同一接口，asar 内已确认）。
 * 退出码：0=已领/成功  2=未成功  1=异常
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const DIR = __dirname;
const LOG = path.join(DIR, 'checkin.log');

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

const CLAIM_FN = async () => {
  try {
    if (!window.wb || !window.wb.http) return { error: 'no window.wb.http' };
    const r = await window.wb.http.post('/billing/meter/daily-checkin', {});
    const d = r && (r.data !== undefined ? r.data : r);
    return d || { raw: 'empty' };
  } catch (e) { return { error: String(e && e.message || e) }; }
};

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = browser.contexts()[0];
    const pages = ctx.pages();
    if (!pages.length) { log('ERROR: 无页面'); process.exit(1); }
    const page = pages.find(p => /WorkBuddy\/resources/.test(p.url())) || pages[0];

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
      log('API直签: 今日已领取（连续 ' + st.streak_days + ' 天, 累计 ' + st.total_credits + ' 分）-> 无需操作');
      try { await browser.close(); } catch (e) {}
      process.exit(0);
    }
    log('API直签: 今日未领取，开始调 POST /billing/meter/daily-checkin ...');

    let claim = null, claimFrameLog = [];
    for (const f of page.frames()) {
      try {
        const r = await f.evaluate(CLAIM_FN);
        claimFrameLog.push(f.url().slice(0, 40) + ' -> ' + JSON.stringify(r).slice(0, 200));
        if (r && !r.error && (r.credit !== undefined || r.streak_days !== undefined || r.code === 0)) { claim = r; break; }
      } catch (e) { claimFrameLog.push(f.url().slice(0, 40) + ' -> ERR ' + (e.message || '').slice(0, 80)); }
    }
    log('claim 结果:', claimFrameLog.join(' || '));
    await wait(2000);

    st = await status();
    if (st && st.today_checked_in === true) {
      log('服务端核验: 今日已领取（连续 ' + st.streak_days + ' 天, 累计 ' + st.total_credits + ' 分）-> API 补签成功');
      try { await browser.close(); } catch (e) {}
      process.exit(0);
    }
    log('RESULT: API 补签未成功（服务端 today_checked_in=' + (st ? st.today_checked_in : 'null') + '）');
    try { await browser.close(); } catch (e) {}
    process.exit(2);
  } catch (e) {
    log('ERROR:', e.message);
    try { if (browser) await browser.close(); } catch (e2) {}
    process.exit(1);
  }
})();
