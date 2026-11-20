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
  await page.evaluate(() => new Promise(resolve => {
    let i=0; const chk=()=>{i++;const g=Ext.ComponentQuery.query('grid').filter(x=>x.store?.getCount?.()>0);if(g.length>0)resolve();else if(i>30)resolve();else setTimeout(chk,1000)};chk();
  }));

  // Get tasks
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(), {credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID,StepID:x.StepID,SN:x.SerialNum}));
  });
  log(`${tasks.length}条待办`);

  for (const task of tasks) {
    log(`\n=== ${task.SN} ===`);
    
    // Open form via FormManager
    log('打开表单...');
    await page.evaluate((args) => {
      const g = Ext.ComponentQuery.query('grid').filter(x=>x.store?.getCount?.()>0)[0];
      const rec = g.store.getAt(0);
      YZSoft.BPM.src.ux.FormManager.openTaskForProcess(args.stepID, { sn: args.sn, sender: g });
    }, { stepID: task.StepID, sn: task.SN });
    
    await wait(5000);
    
    // Force activate the new tab
    log('激活表单tab...');
    const tabInfo = await page.evaluate(() => {
      try {
        const tabPanels = Ext.ComponentQuery.query('tabpanel');
        if (tabPanels.length === 0) return {error:'no tabpanel'};
        
        const tp = tabPanels[0];
        const items = tp.items ? tp.items.items || tp.items.getRange() : [];
        
        const result = items.map(item => {
          // Try to set as active
          try { tp.setActiveTab(item); } catch(e) {}
          return {
            title: item.title,
            closable: item.closable,
            xtype: item.xtype,
            itemId: item.itemId,
            hidden: item.hidden
          };
        });
        
        return {tabCount: items.length, tabs: result};
      } catch(e) { return {error: e.message}; }
    });
    log(`  Tabs: ${JSON.stringify(tabInfo)}`);
    
    // Set active tab to the newly opened form tab
    if (tabInfo.tabs) {
      for (const tab of tabInfo.tabs) {
        if (tab.title && !['流程执行','待审批','流程门户'].includes(tab.title)) {
          log(`  激活: ${tab.title}`);
          await page.evaluate((title) => {
            const tps = Ext.ComponentQuery.query('tabpanel');
            if (tps.length > 0) {
              const items = tps[0].items.items || tps[0].items.getRange();
              for (const item of items) {
                if (item.title === title) {
                  tps[0].setActiveTab(item);
                  return;
                }
              }
            }
          }, tab.title);
          await wait(5000);
          break;
        }
      }
    }
    
    // After activating, dump the form content
    log('检查表单内容...');
    const formContent = await page.evaluate(() => {
      const body = document.body;
      const allBtns = [...document.querySelectorAll('button, a, span.x-btn-inner, input[type=button]')]
        .filter(el => el.offsetParent !== null)
        .map(el => (el.textContent||el.value||'').trim())
        .filter(t => t.length > 0 && t.length < 20);
      
      const iframes = [...document.querySelectorAll('iframe')].map((f,i) => {
        try {
          const doc = f.contentDocument || f.contentWindow.document;
          if (!doc||!doc.body) return null;
          const txt = doc.body.innerText || '';
          const btns = [...doc.querySelectorAll('button, a, span, input')]
            .map(el => (el.textContent||el.value||'').trim())
            .filter(t => t.length > 0 && t.length < 20);
          return {ifr:i, src:(f.src||'').substring(0,100), text:txt.substring(0,300), btns};
        } catch(e) { return null; }
      }).filter(Boolean);
      
      return {
        hasApprove: (body.innerText||'').includes('同意'),
        btns: allBtns,
        bodyPreview: (body.innerText||'').substring(0,500),
        iframes
      };
    });
    log(JSON.stringify(formContent, null, 2));
    
    // Try to click "同意"
    if (formContent.iframes) {
      for (const fi of formContent.iframes) {
        if (fi.btns && fi.btns.includes('同意')) {
          log(`在iframe中找到"同意"按钮`);
    await page.evaluate((args) => {
      const f = document.querySelectorAll('iframe')[args.idx];
      if (!f) return;
      const doc = f.contentDocument || f.contentWindow.document;
      if (!doc) return;
      for (const el of doc.querySelectorAll('button, a, span, input')) {
        if ((el.textContent||el.value||'').trim() === '同意') {
          ['mousedown','mouseup','click'].forEach(e=>
            el.dispatchEvent(new MouseEvent(e,{bubbles:true})));
          return;
        }
      }
    }, { idx: fi.ifr });
          await wait(5000);
          break;
        }
      }
    }
    
    if (formContent.btns && formContent.btns.includes('同意')) {
      log('主页面中找到"同意"按钮');
      const rect = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, a, span')) {
          if (el.textContent.trim() === '同意') {
            const r = el.getBoundingClientRect();
            return {x:r.x+r.w/2, y:r.y+r.h/2};
          }
        }
        return null;
      });
      if (rect) {
        await page.mouse.click(rect.x, rect.y);
        log(`Playwright点击: ${rect.x},${rect.y}`);
        await wait(5000);
      }
    }
    
    // Handle confirmation
    await page.evaluate(() => {
      for (const t of ['确定','是','确认','提交']) {
        for (const el of document.querySelectorAll('button,a,span')) {
          if (el.textContent.trim()===t && el.offsetParent) { el.click(); return; }
        }
      }
    });
    await wait(3000);
    
    // Verify
    const gone = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
      return !r.text().includes(sn);
    }, task.SN);
    
    log(gone ? `  ✅ 审批成功！` : `  ⚠️ 仍在待办`);
    
    // Go back to 待审批 tab
    await page.evaluate(() => {
      const tps = Ext.ComponentQuery.query('tabpanel');
      if (tps.length > 0) {
        for (const item of (tps[0].items?.items || tps[0].items?.getRange() || [])) {
          if (item.title === '待审批') { tps[0].setActiveTab(item); return; }
        }
      }
    });
    await wait(3000);
  }
  
  await b.close();
  log('\n完成');
})().catch(e => console.error(e));
