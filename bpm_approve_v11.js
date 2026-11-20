const { chromium } = require('playwright');
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

  // Get FULL raw worklist response to find ProcessInstanceID
  log('获取完整WorkList响应...');
  const fullResponse = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const text = await r.text();
    return text;
  });
  
  // Print the full first task data
  log(`响应长度: ${fullResponse.length}`);
  
  // Extract first task JSON
  const startIdx = fullResponse.indexOf('{');
  let depth = 0, endIdx = startIdx;
  for (let i = startIdx; i < fullResponse.length; i++) {
    if (fullResponse[i] === '{') depth++;
    if (fullResponse[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }
  
  const firstTaskStr = fullResponse.substring(startIdx, endIdx);
  log(`第一个任务原始数据:\n${firstTaskStr.substring(0, 3000)}`);
  
  // Check for PID, ProcessInstanceID, etc.
  const pidMatches = firstTaskStr.match(/"PID"|"ProcessID"|"ProcessInstanceID"|"piid"|"processId"/g);
  log(`PID相关字段: ${pidMatches || '无'}`);

  // Now try the actual approval flow without screenshots
  log('\n=== 开始审批流程 ===');
  
  // Force show all hidden elements
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      const s = el.style;
      if (s.display === 'none') s.display = 'block';
      if (s.visibility === 'hidden') s.visibility = 'visible';
    });
  });

  // Get tasks from API
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const text = await r.text();
    const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
    return (JSON.parse(clean).children || []);
  });

  // Double-click first task using ExtJS API
  if (tasks.length > 0) {
    log(`双击打开: ${tasks[0].SerialNum}`);
    
    // Try ExtJS grid selection and rowdblclick
    await page.evaluate((sn) => {
      if (typeof Ext === 'undefined') return;
      try {
        // Find all grids
        const comps = Ext.ComponentQuery.query('gridpanel, grid');
        log_msg('grids: ' + comps.length); // can't use console.log in evaluate
        
        for (const g of comps) {
          const store = g.getStore();
          if (!store || typeof store.getCount !== 'function') continue;
          
          for (let i = 0; i < store.getCount(); i++) {
            const rec = store.getAt(i);
            if (rec.get('SerialNum') === sn || rec.get('serialNum') === sn) {
              // Select first
              g.getSelectionModel().select(rec);
              // Fire dblclick on view
              const view = g.getView();
              view.fireEvent('itemdblclick', view, rec);
              // Also try the grid's own handler
              g.fireEvent('itemdblclick', g, rec);
              return;
            }
          }
        }
        
        // Try tree panels
        const trees = Ext.ComponentQuery.query('treepanel');
      } catch(e) {}
    }, tasks[0].SerialNum);
    
    await wait(5000);
    
    // Force show everything again
    await page.evaluate(() => {
      document.querySelectorAll('.x-window, .x-panel, .x-tab, [class*=window], [class*=dialog]').forEach(el => {
        el.style.display = 'block';
        el.style.visibility = 'visible';
        if (el.style.left === '-10000px') el.style.left = '0px';
      });
      document.querySelectorAll('iframe').forEach(el => {
        el.style.display = 'block'; 
        if (el.offsetHeight === 0) el.style.height = '800px';
      });
    });
    await wait(2000);
    
    // Dump ALL text content
    const allText = await page.evaluate(() => {
      const body = document.body;
      
      // Get ExtJS tabs
      let tabs = '';
      try {
        if (typeof Ext !== 'undefined') {
          const tabPanels = Ext.ComponentQuery.query('tabpanel');
          tabPanels.forEach(tp => {
            if (tp.items && tp.items.items) {
              tp.items.items.forEach(item => {
                tabs += `[Tab: ${item.title}] `;
              });
            }
          });
        }
      } catch(e) {}
      
      // Get all iframe content
      let iframeContent = '';
      document.querySelectorAll('iframe').forEach((f, i) => {
        try {
          const doc = f.contentDocument || f.contentWindow.document;
          if (doc && doc.body) {
            const txt = doc.body.innerText || '';
            if (txt.trim().length > 0) {
              iframeContent += `\n[IFRAME${i} ${f.src?.substring(0,80)}]: ${txt.substring(0, 500)}`;
            }
          }
        } catch(e) {}
      });
      
      return {
        tabs,
        bodyText: (body.innerText || '').substring(0, 3000),
        iframeContent,
        has同意: body.innerText.includes('同意'),
        has提交: body.innerText.includes('提交'),
        has审批意见: body.innerText.includes('审批意见'),
        has通过: body.innerText.includes('通过'),
      };
    });
    log(JSON.stringify(allText, null, 2));
    
    // Check for form content
    if (allText.has审批意见 || allText.iframeContent.includes('审批意见')) {
      log('检测到审批表单！');
      
      // Find and click approve
      const clicked = await page.evaluate(() => {
        // In iframes
        for (const f of document.querySelectorAll('iframe')) {
          try {
            const doc = f.contentDocument || f.contentWindow.document;
            if (!doc) continue;
            for (const text of ['同意', '提交', '通过']) {
              for (const el of doc.querySelectorAll('button, a, span, input')) {
                const t = (el.textContent || el.value || '').trim();
                if (t === text) { el.click(); return 'iframe:' + text; }
              }
            }
          } catch(e) {}
        }
        // In main page
        for (const text of ['同意', '提交', '通过']) {
          for (const el of document.querySelectorAll('button, a, span')) {
            const t = el.textContent.trim();
            if (t === text && text !== '批量同意') { el.click(); return 'main:' + text; }
          }
        }
        return 'not found';
      });
      log(`点击: ${clicked}`);
      await wait(4000);
      
      // Confirm
      await page.evaluate(() => {
        for (const t of ['确定','是','确认','提交']) {
          for (const el of document.querySelectorAll('button,a,span')) {
            if (el.textContent.trim() === t) { el.click(); return; }
          }
        }
      });
      await wait(3000);
    }
    
    // Verify
    const remaining = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
      return r.text().includes(sn);
    }, tasks[0].SerialNum);
    
    log(remaining ? '⚠️ 仍在待办' : '✅ 审批成功！');
  }

  await browser.close();
  log('完成');
})().catch(e => console.error(e));
