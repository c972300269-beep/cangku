/**
 * 权威核验 2026-10-13：
 * 1) 监听 /billing/meter/(checkin-status|daily-checkin|checkin-activity-status) 的响应体
 * 2) 清掉 dismissed 标记 + reload，促使浮层重弹
 * 3) 若浮层出现「立即领取」→ 真实点击，捕获 claim 响应（服务端权威结果）
 */
const { chromium } = require('playwright');

const API_RE = /billing\/meter\/(checkin-status|daily-checkin|checkin-activity-status)/;

const BUBBLE_FN = () => {
  let bubbleText = null, btn = null, btnRect = null;
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = ((el.className || '') + '').toString();
      if (/daily-checkin/.test(c)) {
        const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) bubbleText = t.slice(0, 200);
      }
      if (el.tagName === 'BUTTON') {
        const t = (el.innerText || '').replace(/\s+/g, '');
        if (/立即领取|今日已领|已领取|明日/.test(t)) {
          const r = el.getBoundingClientRect();
          btn = t;
          btnRect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        }
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return { bubbleText, btn, btnRect };
};

(async () => {
  let browser = null;
  const caps = [];
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];

    page.on('response', async (resp) => {
      if (!API_RE.test(resp.url())) return;
      let body = '';
      try { body = (await resp.text()).slice(0, 900); } catch (e) {}
      const line = '[' + new Date().toLocaleTimeString('zh-CN') + '] ' + resp.request().method() + ' ' +
        resp.url().replace(/^https?:\/\/[^/]+/, '') + ' -> ' + resp.status() + '\n    ' + body.replace(/\s+/g, ' ');
      caps.push(line);
      console.log('[API] ' + line);
    });

    console.log('--- clear dismissed + reload ---');
    await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/checkin-bubble\.dismissed/.test(k)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
      return keys;
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('reload: ' + e.message.split('\n')[0]));

    let st = null;
    for (let i = 1; i <= 18; i++) {
      await page.waitForTimeout(5000);
      st = await page.evaluate(BUBBLE_FN);
      console.log('t=' + (i * 5) + 's bubble=' + JSON.stringify(st));
      if (st.btn) break;
    }

    if (st && st.btn && /立即领取/.test(st.btn)) {
      console.log('--- 发现「立即领取」，执行真实点击 ---');
      const loc = page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').first();
      const n = await page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').count();
      console.log('[BTN] matched=' + n);
      try { await loc.click({ timeout: 15000 }); console.log('[CLICK] locator ok'); }
      catch (e) {
        console.log('[CLICK] locator err ' + e.message.split('\n')[0] + ' -> JS click');
        await page.evaluate(() => {
          const walk = (root) => {
            for (const el of root.querySelectorAll('*')) {
              const t = (el.innerText || el.textContent || '').replace(/\s+/g, '');
              if (el.tagName === 'BUTTON' && t.includes('立即领取')) { el.click(); return true; }
              if (el.shadowRoot && walk(el.shadowRoot)) return true;
            }
            return false;
          };
          return walk(document);
        });
      }
      await page.waitForTimeout(5000);
      console.log('[AFTER] ' + JSON.stringify(await page.evaluate(BUBBLE_FN)));
    } else {
      console.log('--- 未出现「立即领取」按钮（bubble=' + JSON.stringify(st) + '） ---');
    }

    try { await page.screenshot({ path: require('path').join(__dirname, 'claim2_2026-10-13.png'), timeout: 15000 }); console.log('[SHOT] saved'); } catch (e) { console.log('[SHOT] ' + e.message.split('\n')[0]); }

    console.log('=== API captures (' + caps.length + ') ===');
    caps.forEach(c => console.log('  ' + c));
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
