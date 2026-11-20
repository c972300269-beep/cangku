// 非侵入式取证：读已发生的网络请求 URL + 完整 localStorage growth/checkin 状态
const { chromium } = require('playwright');

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    const r = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource')
        .map(e => e.name)
        .filter(u => /growth|checkin|fuel|credit|activity|sign|award|gift|task/i.test(u));
      const ls = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/checkin|fuel|growth|sign|credit|buddy|award/i.test(k)) ls[k] = (localStorage.getItem(k) || '').slice(0, 800);
      }
      return { urls: [...new Set(res)].slice(0, 40), ls };
    });
    console.log('=== resource urls (growth/checkin related) ===');
    r.urls.forEach(u => console.log('  ' + u));
    console.log('=== localStorage ===');
    console.log(JSON.stringify(r.ls, null, 2));
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
