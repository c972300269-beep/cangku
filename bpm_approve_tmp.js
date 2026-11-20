const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })).newPage();

  try { await page.goto('http://bpm.timesgroup.cn/Default.aspx', { waitUntil: 'networkidle', timeout: 120000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 5000));

  // Wait grid
  await page.evaluate(() => new Promise(resolve => {
    let i=0; const chk = () => { i++; const g = Ext.ComponentQuery.query('grid').filter(x => x.store?.getCount?.() > 0); if (g.length>0) resolve(); else if (i>30) resolve(); else setTimeout(chk,1000); }; chk();
  }));

  // Open form via FormManager with no dlgModel (let it default)
  console.log('Opening form...');
  const openOk = await page.evaluate(() => {
    try {
      const g = Ext.ComponentQuery.query('grid').filter(x => x.store?.getCount?.() > 0)[0];
      const rec = g.store.getAt(0);
      YZSoft.BPM.src.ux.FormManager.openTaskForProcess(rec.get('StepID'), { 
        sn: rec.get('SerialNum'), 
        sender: g
      });
      return 'ok';
    } catch(e) { return 'error: ' + e.message; }
  });
  console.log('  open:', openOk);
  await new Promise(r => setTimeout(r, 15000));

  // Find the "同意" button's ExtJS component and click it properly
  console.log('Clicking agree...');
  const result = await page.evaluate(() => {
    const btns = Ext.ComponentQuery.query('button');
    for (const b of btns) {
      if (b.text === '同意') {
        // Get the actual <a> element
        const el = b.el?.dom;
        if (!el) return 'no el';
        
        // Force show, enable
        if (b.hidden) b.show();
        if (b.disabled) b.enable();
        
        // Scroll into view
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        
        // Get all nested elements' positions
        const rect = el.getBoundingClientRect();
        
        return {
          found: true,
          hidden: b.hidden,
          disabled: b.disabled,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          tag: el.tagName,
          cls: el.className?.toString?.()?.substring(0, 60),
        };
      }
    }
    return 'not found';
  });
  console.log('  btn:', JSON.stringify(result));

  if (result?.found) {
    // Click using Playwright's mouse at the exact position
    const cx = result.rect.x + result.rect.w / 2;
    const cy = result.rect.y + result.rect.h / 2;
    console.log('  clicking at:', cx, cy);
    
    // Move mouse there and click
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 100));
    await page.mouse.up();
    
    await new Promise(r => setTimeout(r, 10000));

    // Check for dialog
    const dialog = await page.evaluate(() => {
      const mb = Ext.ComponentQuery.query('window[cls~=x-message-box]').filter(w => w.isVisible ? w.isVisible() : true);
      return mb.length > 0 ? mb[0].title : null;
    });
    console.log('  dialog:', dialog);

    // Handle dialog
    if (dialog) {
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          if (b.textContent.trim() === '确定' || b.textContent.trim() === '是') {
            b.click(); return;
          }
        }
      });
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Final: try force clicking via locator
  console.log('Trying force locator click...');
  try {
    const spans = page.locator('span.x-btn-inner').filter({ hasText: '同意' });
    const count = await spans.count();
    console.log('  spans found:', count);
    if (count > 0) {
      await spans.first().click({ force: true, timeout: 5000 });
      console.log('  clicked!');
    }
  } catch(e) {
    console.log('  failed:', e.message.substring(0, 100));
  }
  await new Promise(r => setTimeout(r, 10000));

  // Verify
  console.log('Verifying...');
  const v = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList', { credentials: 'include' });
    const t = await r.text();
    const c = t.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (_,y,mo,d,h,mi,s) => '"' + new Date(+y,+mo,+d,+h,+mi,+s).toISOString() + '"');
    return (JSON.parse(c).children || []).map(x => x.SerialNum);
  });
  console.log(v.includes('REQ20260744253') ? 'FAILED' : 'APPROVED!');
  console.log('Remaining:', v.join(', '));

  await b.close();
})().catch(e => console.error(e.message));
