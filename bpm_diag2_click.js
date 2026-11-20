const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

async function safeClose(b) {
  if (!b) return;
  try { await b.close().catch(() => {}); } catch {}
  try { const p = b.process ? b.process() : null; if (p && p.pid) process.kill(p.pid, 'SIGKILL'); } catch {}
}

const MODE = process.argv[2] || 'mouse'; // mouse | dom

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    const url = 'http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=10822016&StepID=138984789&pid=138984789&state=running';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // 等表单 iframe 就绪
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await wait(3000);
      const st = await page.evaluate(() => {
        const fr = [...document.querySelectorAll('iframe')].map(f => {
          let d = null;
          try { d = f.contentDocument; } catch (e) {}
          return {
            src: (f.src || '').slice(-70),
            rs: d ? d.readyState : 'n/a',
            bodyLen: d && d.body ? (d.body.innerText || '').length : -1,
          };
        });
        const agree = [...document.querySelectorAll('A.x-btn')].some(e => e.textContent.trim() === '同意' && e.offsetParent);
        return { fr, agree, extReady: typeof window.Ext !== 'undefined' };
      });
      log(`wait${i + 1}: agree=${st.agree} extReady=${st.extReady} frames=${JSON.stringify(st.fr)}`);
      const formOk = st.fr.some(f => f.rs === 'complete' && f.bodyLen > 0);
      if (st.agree && formOk) { ready = true; log('  >>> form ready'); break; }
    }
    if (!ready) log('!! form not ready, still trying click');

    // 点击
    if (MODE === 'mouse') {
      const rect = await page.evaluate(() => {
        const a = [...document.querySelectorAll('A.x-btn')].find(e => e.textContent.trim() === '同意' && e.offsetParent);
        if (!a) return null;
        const r = a.getBoundingClientRect();
        a.scrollIntoView({ block: 'center' });
        const r2 = a.getBoundingClientRect();
        return { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2, w: r2.width, h: r2.height };
      });
      log('agree rect: ' + JSON.stringify(rect));
      if (rect) {
        await wait(500);
        await page.mouse.move(rect.x, rect.y);
        await wait(200);
        await page.mouse.down(); await wait(120); await page.mouse.up();
        log('mouse clicked');
      }
    } else {
      await page.evaluate(() => {
        const a = [...document.querySelectorAll('A.x-btn')].find(e => e.textContent.trim() === '同意' && e.offsetParent);
        if (a) a.click();
      });
      log('dom clicked');
    }

    for (const t of [3000, 4000, 6000]) {
      await wait(t);
      const snap = [];
      for (const f of page.frames()) {
        try {
          const r = await f.evaluate(() => {
            const wins = [...document.querySelectorAll('.x-window, .x-message-box')]
              .filter(w => w.offsetParent !== null)
              .map(w => ({ cls: (w.className || '').toString().slice(0, 50), txt: (w.innerText || '').slice(0, 120).replace(/\s+/g, ' ') }));
            const btns = [...document.querySelectorAll('button,a,span,input,.x-btn-inner,td')]
              .filter(e => e.offsetParent !== null)
              .map(e => (e.textContent || e.value || '').trim())
              .filter(x => x && x.length < 10);
            return { url: location.href.slice(-60), wins, btns: [...new Set(btns)].slice(0, 25) };
          });
          snap.push(r);
        } catch (e) {}
      }
      log('--- snapshot');
      snap.forEach(s => log(`  frame ${s.url} | wins=${JSON.stringify(s.wins)} | btns=${s.btns.join(',')}`));
    }

    try { await page.screenshot({ path: 'E:/workbuddy/Claw/reports/diag2_' + MODE + '.png', timeout: 20000 }); log('screenshot ok'); } catch (e) { log('shot fail'); }
    log('errors: ' + (errs.length ? errs.slice(0, 6).join(' || ') : 'none'));
  } catch (e) {
    log('FATAL ' + e.message);
  } finally {
    await safeClose(b);
  }
})();
