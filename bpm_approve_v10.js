const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.join(__dirname, '..', '..', 'reports');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  })).newPage();

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(20000);

  // Get worklist
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const text = await r.text();
    const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
    return (JSON.parse(clean).children || []);
  });
  
  if (tasks.length === 0) { log('无待办'); await browser.close(); return; }
  log(`待办: ${tasks.length}条`);

  for (const task of tasks) {
    log(`\n=== 处理: ${task.SerialNum} ===`);
    
    // 1. Force show ALL ExtJS windows/dialogs (headless fix)
    await page.evaluate(() => {
      // Make all windows visible
      const all = document.querySelectorAll('.x-window, .x-panel, .x-message-box, [class*=dialog], [class*=msgbox], [class*=window]');
      for (const el of all) {
        el.style.display = '';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.position = 'relative';
        el.style.left = '0px';
        el.style.top = '0px';
        el.style.zIndex = '9999';
        if (el.style.display === 'none') el.style.display = 'block';
      }
      // Make ALL iframes visible
      const iframes = document.querySelectorAll('iframe');
      for (const f of iframes) {
        f.style.display = '';
        f.style.visibility = 'visible';
        if (f.offsetHeight === 0) f.style.height = '800px';
        if (f.offsetWidth === 0) f.style.width = '1200px';
      }
    });

    // 2. Double click the row
    log('  双击行...');
    await page.evaluate((sn) => {
      // Try ExtJS API first
      if (typeof Ext !== 'undefined') {
        try {
          const grids = Ext.ComponentQuery.query('gridpanel');
          for (const g of grids) {
            const store = g.getStore();
            if (!store || !store.getCount) continue;
            for (let i = 0; i < store.getCount(); i++) {
              const rec = store.getAt(i);
              if (rec.get('SerialNum') === sn) {
                g.getView().fireEvent('itemdblclick', g.getView(), rec);
                return;
              }
            }
          }
        } catch(e) {}
      }
      
      // DOM fallback
      const items = document.querySelectorAll('.x-grid-item, .x-grid-row');
      for (const item of items) {
        if (item.textContent.includes(sn)) {
          item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          return;
        }
      }
    }, task.SerialNum);
    
    await wait(3000);

    // 3. Force show windows again
    await page.evaluate(() => {
      const all = document.querySelectorAll('.x-window, .x-panel, .x-message-box, [class*=dialog], [class*=msgbox]');
      for (const el of all) {
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.position = 'relative';
        el.style.left = '0px';
        el.style.top = '0px';
        el.style.zIndex = '9999';
      }
    });
    await wait(2000);

    // 4. Dump all visible page content for debugging
    await page.screenshot({ path: path.join(REPORT_DIR, `bpm_task_${task.SerialNum}.png`) });
    
    // Check ALL text on page including iframes
    const pageContent = await page.evaluate(() => {
      let allText = '';
      // Main body
      allText += '=== MAIN ===\n' + (document.body.innerText || '').substring(0, 1000) + '\n';
      // Iframes
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((f, i) => {
        try {
          const doc = f.contentDocument || f.contentWindow.document;
          if (doc && doc.body) {
            allText += `\n=== IFRAME ${i} [${f.src?.substring(0,100)}] ===\n`;
            allText += (doc.body.innerText || '').substring(0, 500);
          }
        } catch(e) {}
      });
      // ExtJS windows
      const wins = document.querySelectorAll('.x-window-body, .x-panel-body');
      wins.forEach((w, i) => {
        const txt = (w.innerText || '').trim();
        if (txt.length > 0) {
          allText += `\n=== WINDOW ${i} ===\n` + txt.substring(0, 500);
        }
      });
      return allText;
    });
    log(`  页面内容:\n${pageContent.substring(0, 2000)}`);

    // 5. Find and click approve button anywhere
    const approveResult = await page.evaluate(() => {
      const approveTexts = ['同意', '提交', '通过', '批准'];
      
      // Check iframes
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          if (!doc) continue;
          for (const text of approveTexts) {
            for (const el of doc.querySelectorAll('button, a, span, input')) {
              if ((el.textContent || el.value || '').trim() === text) {
                el.click();
                return { location: 'iframe', text };
              }
            }
          }
        } catch(e) {}
      }
      
      // Check main page
      for (const text of approveTexts) {
        for (const el of document.querySelectorAll('button, a, span, input')) {
          const t = (el.textContent || el.value || '').trim();
          if (t === text && !t.includes('批量')) { // Exclude 批量同意
            el.click();
            return { location: 'main', text };
          }
        }
      }
      
      return { found: false };
    });
    log(`  审批按钮: ${JSON.stringify(approveResult)}`);
    
    await wait(3000);

    // 6. Handle any confirmation
    await page.evaluate(() => {
      for (const text of ['确定', '是', '确认', '提交']) {
        for (const el of document.querySelectorAll('button, a, span')) {
          if (el.textContent.trim() === text) { el.click(); return; }
        }
      }
    });
    await wait(2000);

    // 7. Fill any textarea
    await page.evaluate(() => {
      for (const ta of document.querySelectorAll('textarea')) {
        if (ta.offsetParent && !ta.value) {
          ta.value = '同意';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await wait(1000);

    // 8. Click confirm again if needed
    await page.evaluate(() => {
      for (const text of ['确定', '是', '确认', '提交']) {
        for (const el of document.querySelectorAll('button, a, span')) {
          if (el.textContent.trim() === text) { el.click(); return; }
        }
      }
    });
    await wait(3000);

    // 9. Verify
    const remaining = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      return !text.includes(sn);
    }, task.SerialNum);
    
    if (remaining) {
      log(`  ✅ 审批成功！`);
    } else {
      log(`  ⚠️ 仍在待办`);
    }
  }

  await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_final.png') });
  await browser.close();
  log('\n完成');
})().catch(e => console.error(e));
