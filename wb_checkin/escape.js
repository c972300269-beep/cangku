const { chromium } = require('playwright');
(async () => {
  let b = null;
  try {
    b = await chromium.connectOverCDP('http://127.0.0.1:9222');
    for (const ctx of b.contexts()) {
      for (const p of ctx.pages()) {
        if ((p.url() || '').includes('app.asar') || (p.url() || '').startsWith('file://')) {
          await p.keyboard.press('Escape');
          await new Promise(r => setTimeout(r, 400));
          await p.keyboard.press('Escape');
        }
      }
    }
    console.log('ok');
  } catch (e) { console.log('ERR ' + e.message); }
  finally { try { await b.close(); } catch (e) {} }
})();
