const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await (await b.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  })).newPage();

  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(20000);

  // Wait for grid
  log('等待Grid加载...');
  await page.evaluate(() => new Promise(resolve => {
    let i = 0;
    const chk = () => {
      i++;
      if (typeof Ext !== 'undefined') {
        const g = Ext.ComponentQuery.query('grid').filter(x => x.store?.getCount?.() > 0);
        if (g.length > 0) { resolve(); return; }
      }
      if (i > 30) resolve();
      else setTimeout(chk, 1000);
    };
    chk();
  }));

  // Open form
  log('打开表单...');
  const openResult = await page.evaluate(() => {
    try {
      const g = Ext.ComponentQuery.query('grid').filter(x => x.store?.getCount?.() > 0)[0];
      const rec = g.store.getAt(0);
      log_msg = 'StepID=' + rec.get('StepID') + ' SN=' + rec.get('SerialNum');
      YZSoft.BPM.src.ux.FormManager.openTaskForProcess(rec.get('StepID'), {
        sn: rec.get('SerialNum'),
        sender: g
      });
      return { stepID: rec.get('StepID'), sn: rec.get('SerialNum') };
    } catch(e) { return { error: e.message }; }
  });
  log(`  打开: ${JSON.stringify(openResult)}`);
  
  // Wait and poll for form
  log('等待表单渲染...');
  let formReady = false;
  for (let i = 0; i < 30; i++) {
    await wait(2000);
    
    const state = await page.evaluate(() => {
      try {
        // Check tabs
        const tabs = Ext.ComponentQuery.query('tab').map(t => ({ 
          title: t.title, 
          closable: t.closable
        }));
        
        // Check ALL buttons
        const allBtns = Ext.ComponentQuery.query('button').map(b => ({
          text: b.text || b.getText?.() || '',
          hidden: b.hidden,
          disabled: b.disabled,
          itemId: b.itemId,
          xtype: b.xtype
        }));
        
        // Check windows/panels
        const windows = Ext.ComponentQuery.query('window').map(w => ({
          title: w.title,
          hidden: w.hidden,
          visible: w.isVisible?.() ?? !w.hidden,
          xtype: w.xtype
        }));
        
        // Check iframes
        const iframes = [...document.querySelectorAll('iframe')].length;
        
        // Body text for any form content
        const bodyText = (document.body.innerText || '').substring(0, 500);
        
        return { tabs, allBtns: allBtns.slice(0, 30), windows, iframes, bodyText };
      } catch(e) { return { error: e.message }; }
    });
    
    const hasFormTab = state.tabs?.some(t => !['流程执行','待审批','流程门户'].includes(t.title));
    const hasFormBtn = state.allBtns?.some(b => 
      (b.text === '同意' || b.text === '提交' || b.text === '通过') && !b.hidden
    );
    
    if (i === 0 || hasFormTab || hasFormBtn) {
      log(`  轮询${i+1}: tabs=${state.tabs?.map(t=>t.title).join(',')} iframes=${state.iframes} windows=${state.windows?.length}`);
      if (hasFormBtn) {
        log(`  找到表单按钮: ${state.allBtns?.filter(b => !b.hidden).map(b => b.text).filter(Boolean).join(', ')}`);
      }
    }
    
    if (hasFormTab || hasFormBtn) {
      formReady = true;
      break;
    }
  }

  if (formReady) {
    log('表单已加载！');
    
    // Dump full state
    const fullState = await page.evaluate(() => {
      try {
        const tabs = Ext.ComponentQuery.query('tab').map(t => ({ title: t.title, closable: t.closable }));
        const btns = Ext.ComponentQuery.query('button').filter(b => !b.hidden).map(b => ({
          text: b.text || b.getText?.() || '', disabled: b.disabled
        }));
        const body = (document.body.innerText || '').substring(0, 1000);
        
        // Check iframes
        const iframes = [...document.querySelectorAll('iframe')].map(f => {
          try {
            const doc = f.contentDocument || f.contentWindow.document;
            return doc?.body?.innerText?.substring(0, 300) || '';
          } catch(e) { return ''; }
        }).filter(Boolean);
        
        return { tabs, btns, body, iframes };
      } catch(e) { return { error: e.message }; }
    });
    log(JSON.stringify(fullState, null, 2));
    
    // Try clicking "同意" using both ExtJS and Playwright
    const clickResult = await page.evaluate(() => {
      try {
        // Find "同意" button
        const btns = Ext.ComponentQuery.query('button');
        for (const b of btns) {
          const t = b.text || b.getText?.() || '';
          if (t === '同意' && !b.hidden && !b.disabled) {
            // Get position for Playwright click
            const el = b.el?.dom;
            if (el) {
              const rect = el.getBoundingClientRect();
              return { 
                found: true, 
                text: t, 
                disabled: b.disabled, 
                hidden: b.hidden,
                rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
              };
            }
          }
        }
        // Also check DOM
        const spans = [...document.querySelectorAll('span.x-btn-inner')].filter(s => s.textContent.trim() === '同意');
        if (spans.length > 0) {
          const rect = spans[0].getBoundingClientRect();
          return { found: true, text: '同意(DOM)', rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
        }
        return { found: false, totalBtns: btns.length };
      } catch(e) { return { error: e.message }; }
    });
    log(`按钮: ${JSON.stringify(clickResult)}`);
    
    if (clickResult?.found && clickResult.rect) {
      const cx = clickResult.rect.x + clickResult.rect.w / 2;
      const cy = clickResult.rect.y + clickResult.rect.h / 2;
      log(`Playwright点击: ${cx}, ${cy}`);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await wait(100);
      await page.mouse.up();
      
      await wait(8000);
      
      // Handle dialog
      await page.evaluate(() => {
        try {
          const mb = Ext.ComponentQuery.query('window[cls~=x-message-box]').filter(w => w.isVisible?.() !== false);
          if (mb.length > 0) {
            const btns = mb[0].query('button');
            for (const b of btns) {
              if ((b.text || b.getText?.() || '') === '确定' || (b.text || b.getText?.() || '') === '是') {
                b.handler?.call(b.scope || b, b);
                return;
              }
            }
          }
        } catch(e) {}
        // DOM fallback
        for (const el of document.querySelectorAll('button, a, span')) {
          const t = el.textContent.trim();
          if (t === '确定' || t === '是') { el.click(); return; }
        }
      });
      await wait(3000);
    }
  } else {
    log('⚠️ 表单未加载');
  }

  // Verify
  log('\n验证...');
  const remaining = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const t = await r.text();
    const c = t.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (_,y,mo,d,h,mi,s) => '"' + new Date(+y,+mo,+d,+h,+mi,+s).toISOString() + '"');
    return (JSON.parse(c).children || []).map(x => ({ sn: x.SerialNum, name: x.ProcessName }));
  });
  
  log(`剩余: ${remaining.length}条`);
  remaining.forEach(r => log(`  ${r.sn} ${r.name}`));

  await b.close();
})().catch(e => console.error(e));
