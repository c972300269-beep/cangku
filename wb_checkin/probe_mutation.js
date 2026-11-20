// 用 MutationObserver 记录点击「立即领取」后页面上出现的所有新文本（含 shadow DOM）
const { chromium } = require('playwright');

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

    let found = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1500);
      const n = await page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').count().catch(() => 0);
      if (n > 0) { found = true; console.log('button appeared at t=' + (i * 1.5) + 's'); break; }
    }
    if (!found) { console.log('button never appeared'); return; }

    // 安装观察器（覆盖所有 shadow root）
    await page.evaluate(() => {
      window.__wbLog = [];
      const attach = (root) => {
        try {
          const mo = new MutationObserver((muts) => {
            for (const m of muts) {
              if (m.type === 'childList' && m.addedNodes) {
                for (const n of m.addedNodes) {
                  const t = ((n.innerText || n.textContent || '') + '').replace(/\s+/g, ' ').trim();
                  if (t) window.__wbLog.push(t.slice(0, 200));
                }
              }
              if (m.type === 'characterData') {
                const t = ((m.target.textContent || '') + '').replace(/\s+/g, ' ').trim();
                if (t) window.__wbLog.push('[char] ' + t.slice(0, 200));
              }
            }
          });
          mo.observe(root, { childList: true, subtree: true, characterData: true });
        } catch (e) {}
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) attach(el.shadowRoot);
      };
      attach(document);
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('*')) if (el.shadowRoot) attach(el.shadowRoot);
      }).observe(document, { childList: true, subtree: true });
    });

    console.log('--- clicking ---');
    try { await page.locator('.daily-checkin--bubble button.go, .daily-checkin button.go').first().click({ timeout: 10000 }); console.log('clicked'); }
    catch (e) { console.log('click err ' + e.message.split('\n')[0]); }
    await page.waitForTimeout(10000);

    const log = await page.evaluate(() => (window.__wbLog || []).slice(0, 60));
    console.log('=== new text after click (' + log.length + ') ===');
    log.forEach(x => console.log('  ' + x));
    try { await page.screenshot({ path: require('path').join(__dirname, 'mutation_2026-10-13.png'), timeout: 15000 }); console.log('[SHOT] saved'); } catch (e) {}
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
