// 监听网络：reload 渲染进程，捕获 checkin/growth/activity 相关接口的响应，取服务端权威状态
const { chromium } = require('playwright');

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    const hits = [];
    page.on('response', async (resp) => {
      const u = resp.url();
      if (!/growth|checkin|fuel|credit|activity|sign|award|gift|task|usercenter/i.test(u)) return;
      let body = '';
      try {
        const ct = (resp.headers()['content-type'] || '');
        if (/json|text/i.test(ct)) body = (await resp.text()).slice(0, 1200);
      } catch (e) {}
      hits.push(resp.status() + ' ' + u + (body ? '\n    ' + body.replace(/\s+/g, ' ').slice(0, 900) : ''));
      console.log('[NET] ' + resp.status() + ' ' + u.slice(0, 160));
    });

    console.log('--- reload ---');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('reload: ' + e.message.split('\n')[0]));
    await page.waitForTimeout(12000);

    console.log('=== captured (' + hits.length + ') ===');
    hits.forEach(h => console.log('  ' + h));

    // reload 后新浮层状态
    const st = await page.evaluate(() => {
      let bubbleText = null, btn = null;
      const walk = (root) => {
        for (const el of root.querySelectorAll('*')) {
          const c = ((el.className || '') + '').toString();
          if (/daily-checkin/.test(c)) bubbleText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
          if (el.tagName === 'BUTTON') {
            const t = (el.innerText || '').replace(/\s+/g, '');
            if (/立即领取|今日已领|已领取|明日/.test(t)) btn = t;
          }
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(document);
      return { bubbleText, btn, dismissed: localStorage.getItem('agent-ui.checkin-bubble.dismissed:bf234010-13c9-41ca-9fff-3f5e74ba1f30') };
    });
    console.log('=== after reload bubble state ===');
    console.log(JSON.stringify(st, null, 2));
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
