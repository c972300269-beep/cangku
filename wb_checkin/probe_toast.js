// 点击「立即领取」后立即抓取出现的 toast/提示文本，判定成功 vs 今日已领
const { chromium } = require('playwright');

const TXT = () => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      const c = ((el.className || '') + '').toString();
      if (!/toast|message|notification|alert|tips|bubble|popover|daily-checkin|fuel/i.test(c)) { if (el.shadowRoot) walk(el.shadowRoot); continue; }
      const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      const r = el.getBoundingClientRect();
      if (t && t.length < 160) out.push('.' + c.slice(0, 45) + ' @' + [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] + ' | ' + t);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return [...new Set(out)].slice(0, 25);
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    await page.evaluate(() => {
      const ks = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/checkin-bubble\.dismissed/.test(k)) ks.push(k); }
      ks.forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

    // 等到按钮出现
    let found = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1500);
      const n = await page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').count().catch(() => 0);
      if (n > 0) { found = true; console.log('button appeared at t=' + (i * 1.5) + 's'); break; }
    }
    if (!found) { console.log('button never appeared'); return; }

    console.log('--- clicking ---');
    try { await page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').first().click({ timeout: 10000 }); console.log('clicked'); }
    catch (e) { console.log('click err ' + e.message.split('\n')[0]); }

    for (let i = 1; i <= 12; i++) {
      await page.waitForTimeout(600);
      const t = await page.evaluate(TXT);
      const interesting = t.filter(x => /积分|领取|已领|成功|明日|签到|重试|失败|稍后/.test(x));
      console.log('--- t=' + (i * 0.6).toFixed(1) + 's ---');
      interesting.forEach(x => console.log('   ' + x));
    }
    try { await page.screenshot({ path: require('path').join(__dirname, 'toast_2026-10-13.png'), timeout: 15000 }); console.log('[SHOT] saved'); } catch (e) {}
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
