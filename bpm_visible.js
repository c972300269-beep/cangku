const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();

  // Monitor all fetch/XHR
  const calls = [];
  page.on('request', req => {
    if (req.url().includes('ashx') || req.url().includes('BPM')) {
      calls.push({ m: req.method(), u: req.url().split('/').pop() });
    }
  });

  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 12000));

  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  // Find and double-click task row
  const SN = 'REQ20260725900';
  console.log('\n查找任务:', SN);

  // Try to find the worklist grid and click
  const gridData = await page.evaluate((sn) => {
    // Find ExtJS grid store
    if (typeof Ext !== 'undefined') {
      try {
        // Try BPM specific namespace
        const ns = Ext || YZ || window.YZSoft;
        const grids = document.querySelectorAll('.x-grid-view');
        return { gridCount: grids.length };
      } catch(e) { return { error: e.message }; }
    }
    return { noExt: true };
  }, SN);

  console.log('Grid:', JSON.stringify(gridData));

  // Try clicking on the row in DOM
  const dblClick = await page.evaluate((sn) => {
    const allRows = document.querySelectorAll('tr, .x-grid-row, div[class*=row]');
    for (const row of allRows) {
      if (row.textContent.includes(sn)) {
        const evt = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window });
        row.dispatchEvent(evt);
        return 'dblclicked';
      }
    }
    return 'not found in ' + allRows.length + ' rows';
  }, SN);
  console.log('Row click:', dblClick);

  await new Promise(r => setTimeout(r, 5000));

  // Check what opened
  const afterClick = await page.evaluate(() => {
    const tabs = document.querySelectorAll('.x-tab, [class*=tab-header]');
    const tabTexts = [...tabs].map(t => t.textContent.trim()).filter(Boolean);
    const panels = document.querySelectorAll('[class*=panel], [class*=window]');
    const panelTexts = [...panels].slice(0, 5).map(p => p.textContent.trim().substring(0, 100));
    const iframes = document.querySelectorAll('iframe');
    const iframeSrcs = [...iframes].map(f => f.src);
    const buttons = [...document.querySelectorAll('button, .x-btn-text, input[type=button]')]
      .map(b => b.textContent.trim() || b.value)
      .filter(Boolean);
    return { tabTexts: tabTexts.slice(0, 10), panelTexts, iframeCount: iframes.length, iframeSrcs, buttons: buttons.slice(0, 20) };
  });
  console.log('After click:', JSON.stringify(afterClick, null, 2));

  console.log('\nAPI calls:');
  calls.forEach(c => console.log(' ', c.m, c.u));

  await browser.close();
})().catch(e => console.error(e));
