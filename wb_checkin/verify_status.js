/**
 * 权威核验签到状态（服务端口径）—— 2026-10-13 新增
 *
 * 背景：WorkBuddy v5.8.2（2026-10-12 20:09 自动更新）已移除旧的 .fuel-station 浮层，
 *       改版为 .daily-checkin--bubble（shadow DOM，左下角头像槽 wb-slot--avatar-top-combo）。
 *       DOM 文本判定在改版后不可靠（浮层是「轮播槽」，且按钮文本会在状态返回后消失）。
 *
 * 现改为直接调用宿主桥接口取服务端权威状态（只读，不领取）：
 *   window.wb.http.post('/billing/meter/checkin-activity-status', {})
 * 关键字段：today_checked_in / streak_days / today_credit / checkin_dates / total_credits
 *
 * 注意：/billing/meter/checkin-status（v1 旧接口）返回 active:false 的废弃数据，勿用。
 * 退出码：0=今日已领取；2=今日未领取；1=异常
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const _d = new Date();
const day = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0');
const OUT = path.join(__dirname, 'status_' + day + '.json');

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    const raw = await page.evaluate(async () => {
      try {
        const r = await window.wb.http.post('/billing/meter/checkin-activity-status', {});
        return JSON.stringify(r);
      } catch (e) { return JSON.stringify({ error: e && e.message }); }
    });
    const data = JSON.parse(raw);
    fs.writeFileSync(OUT, JSON.stringify({ time: new Date().toISOString(), raw: data }, null, 2), 'utf8');
    const d = data && data.data ? data.data : {};
    console.log('today_checked_in = ' + d.today_checked_in);
    console.log('streak_days      = ' + d.streak_days);
    console.log('today_credit     = ' + d.today_credit);
    console.log('total_credits    = ' + d.total_credits);
    console.log('checkin_dates    = ' + JSON.stringify(d.checkin_dates));
    console.log('saved -> ' + OUT);
    process.exit(d.today_checked_in === true ? 0 : 2);
  } catch (e) {
    console.log('ERROR ' + e.message);
    process.exit(1);
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
})();
