// 通过渲染进程的宿主桥 wb.http 直接查询签到状态（只读，不领取）
const { chromium } = require('playwright');

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];

    const info = await page.evaluate(() => {
      const out = {};
      try { out.httpKeys = Object.keys(window.wb.http || {}); } catch (e) { out.httpErr = e.message; }
      try { out.httpType = typeof window.wb.http; } catch (e) {}
      try { out.accountKeys = Object.keys(window.wb.account || {}).slice(0, 20); } catch (e) {}
      try { out.envKeys = Object.keys(window.wb.env || {}).slice(0, 30); } catch (e) {}
      return out;
    });
    console.log('wb.http keys: ' + JSON.stringify(info.httpKeys));
    console.log('wb.account keys: ' + JSON.stringify(info.accountKeys));
    console.log('wb.env keys: ' + JSON.stringify(info.envKeys));

    // 尝试各种调用方式
    const attempts = [
      ['http.post checkin-status', `window.wb.http.post('/billing/meter/checkin-status', {})`],
      ['http.get checkin-status', `window.wb.http.get('/billing/meter/checkin-status')`],
      ['http.post v2 checkin-status', `window.wb.http.post('/v2/billing/meter/checkin-status', {})`],
      ['http.request checkin-status', `window.wb.http.request({url:'/billing/meter/checkin-status',method:'POST',data:{}})`],
      ['http.post activity-status', `window.wb.http.post('/billing/meter/checkin-activity-status', {})`]
    ];
    for (const [label, code] of attempts) {
      try {
        const r = await page.evaluate(`(async () => { try { const x = await ${code}; return JSON.stringify(x).slice(0,900); } catch(e){ return 'ERR ' + (e && e.message); } })()`);
        console.log('[' + label + '] ' + r);
      } catch (e) { console.log('[' + label + '] outer ERR ' + e.message); }
    }
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
