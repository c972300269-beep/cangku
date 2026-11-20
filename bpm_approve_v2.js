const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');
const REPORT_DIR = path.join(__dirname, '..', '..', 'reports');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function ts() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  // Capture console errors
  page.on('pageerror', err => log(`[PAGE_ERR] ${err.message?.substring(0, 150)}`));

  try {
    // ==========================================
    // Step 1: Login
    // ==========================================
    log('=== Step 1: 登录BPM ===');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(12000);
    log(`标题: ${await page.title()}`);
    log(`URL: ${page.url()}`);

    // Check if ExtJS loaded
    const extLoaded = await page.evaluate(() => typeof Ext !== 'undefined');
    log(`ExtJS已加载: ${extLoaded}`);

    if (!extLoaded) {
      log('ExtJS未加载，可能登录失败');
      await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_login_fail.png') });
      return;
    }

    // ==========================================
    // Step 2: Get Worklist via API
    // ==========================================
    log('\n=== Step 2: 获取待办任务 ===');
    const worklistRaw = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      return await r.text();
    });

    // Clean new Date()
    const clean = worklistRaw.replace(/new Date\(([^)]+)\)/g, (m, args) => {
      const parts = args.split(',').map(p => parseInt(p.trim()));
      const d = new Date(parts[0], parts[1], parts[2], parts[3]||0, parts[4]||0, parts[5]||0);
      return '"' + d.toISOString() + '"';
    });

    let data = JSON.parse(clean);
    let tasks = data.children || [];
    log(`待办任务数: ${tasks.length}`);

    if (tasks.length === 0) {
      log('没有待办任务，无需审批');
      await browser.close();
      return;
    }

    // Display tasks
    console.log('\n待办任务列表:');
    tasks.forEach((t, i) => {
      console.log(`${i+1}. [${t.SerialNum}] ${t.ProcessName}`);
      console.log(`   描述: ${t.Description || '-'}`);
      console.log(`   TaskID=${t.TaskID} StepID=${t.StepID} 节点=${t.NodeName}`);
    });

    // ==========================================
    // Step 3: Navigate to Worklist via ExtJS
    // ==========================================
    log('\n=== Step 3: 打开待审批列表 ===');

    // Click on "待审批" in the sidebar tree
    const navResult = await page.evaluate(() => {
      // ExtJS tree panel - find "待审批" node
      if (typeof Ext === 'undefined') return 'Ext not loaded';
      
      try {
        // Find tree panels
        const trees = Ext.ComponentQuery.query('treepanel');
        const panels = Ext.ComponentQuery.query('panel');
        
        // Try to find the sidebar menu
        let found = false;
        
        // Method 1: fire event on tree node
        for (const tree of trees) {
          try {
            const store = tree.getStore();
            if (store && store.getRootNode) {
              const root = store.getRootNode();
              root.cascadeBy(node => {
                if (node.get('text') === '待审批' || node.get('text') === 'Worklist') {
                  tree.fireEvent('itemclick', tree, node.data);
                  found = true;
                  return false; // stop cascade
                }
              });
            }
          } catch(e) {}
          if (found) break;
        }
        
        if (found) return 'clicked via tree';
        
        // Method 2: find by DOM text
        const allEls = document.querySelectorAll('.x-tree-node-text, .x-grid-cell-inner, .x-tree-node-anchor');
        for (const el of allEls) {
          if (el.textContent.trim() === '待审批') {
            el.click();
            return 'clicked via DOM';
          }
        }
        
        return 'not found: ' + document.querySelectorAll('.x-tree-node-text').length + ' tree nodes';
      } catch(e) {
        return 'error: ' + e.message;
      }
    });
    log(`导航: ${navResult}`);
    await wait(8000);

    // Check if task grid loaded
    const gridState = await page.evaluate(() => {
      try {
        const grids = Ext.ComponentQuery.query('gridpanel, grid');
        for (const g of grids) {
          const store = g.getStore();
          if (store && store.getCount && store.getCount() > 0) {
            return { type: 'grid', count: store.getCount(), title: g.title };
          }
        }
        return { type: 'no grid', grids: grids.length, bodyTxt: document.body.innerText.substring(0, 200) };
      } catch(e) {
        return { type: 'error', msg: e.message };
      }
    });
    log(`Grid状态: ${JSON.stringify(gridState)}`);

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_worklist.png') });

    // ==========================================
    // Step 4: Open first task form
    // ==========================================
    log('\n=== Step 4: 打开任务表单 ===');
    
    // Get the SerialNum of first task
    const targetSN = tasks[0].SerialNum;
    log(`目标任务: ${targetSN}`);

    // Try to open task via ExtJS grid double-click
    const openResult = await page.evaluate((sn) => {
      try {
        const grids = Ext.ComponentQuery.query('gridpanel, grid');
        for (const g of grids) {
          const store = g.getStore();
          if (store && store.getCount && store.getCount() > 0) {
            for (let i = 0; i < store.getCount(); i++) {
              const rec = store.getAt(i);
              const serialNum = rec.get('SerialNum') || rec.get('serialNum') || '';
              if (serialNum === sn) {
                // Try fire event
                g.fireEvent('itemdblclick', g, rec);
                return 'fired itemdblclick';
              }
            }
          }
        }
        return 'task not in grid: ' + sn + ' checked ' + (Ext.ComponentQuery.query('gridpanel').length) + ' grids';
      } catch(e) {
        return 'error: ' + e.message;
      }
    }, targetSN);
    log(`打开任务: ${openResult}`);
    await wait(8000);

    // Check what's visible now
    const afterOpen = await page.evaluate(() => {
      try {
        // Find any open windows/tabs
        const tabs = Ext.ComponentQuery.query('tab');
        const windows = Ext.ComponentQuery.query('window');
        
        const tabInfo = tabs.map(t => ({ title: t.title, closable: t.closable }));
        const winInfo = windows.map(w => ({ title: w.title, visible: !w.hidden }));
        
        // Check iframes
        const iframes = [...document.querySelectorAll('iframe')].map(f => ({
          id: f.id, name: f.name, src: (f.src || '').substring(0, 200)
        }));
        
        return { tabs: tabInfo, windows: winInfo, iframes, bodyLen: document.body.innerText.length };
      } catch(e) {
        return { error: e.message };
      }
    });
    log(`打开后状态: ${JSON.stringify(afterOpen, null, 2)}`);

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_task_opened.png') });

    // ==========================================
    // Step 5: Find and click approval button
    // ==========================================
    log('\n=== Step 5: 查找审批按钮 ===');

    // Check all iframes for the form content and approve button
    const approvalResult = await page.evaluate(() => {
      const allIframes = document.querySelectorAll('iframe');
      const results = [];
      
      for (const iframe of allIframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          if (!doc || !doc.body) continue;
          
          const bodyText = doc.body.innerText || '';
          results.push({
            src: (iframe.src || '').substring(0, 150),
            text: bodyText.substring(0, 500),
            has同意: bodyText.includes('同意'),
            has提交: bodyText.includes('提交'),
            has通过: bodyText.includes('通过'),
            has退回: bodyText.includes('退回'),
          });
          
          // Try to find and click approve button
          const allElements = doc.querySelectorAll('button, input[type=button], input[type=submit], a, span, div');
          for (const el of allElements) {
            const txt = (el.textContent || el.value || '').trim();
            if (txt === '同意' || txt === '提交' || txt === '通过' || txt === '批准') {
              // Try to find the actual clickable element (ExtJS button wrapping)
              let target = el;
              // Walk up to find the button component
              for (let i = 0; i < 5 && target; i++) {
                if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.onclick) {
                  target.click();
                  return { success: true, element: txt, src: (iframe.src || '').substring(0, 100) };
                }
                target = target.parentElement;
              }
              el.click();
              return { success: true, element: txt, direct: true, src: (iframe.src || '').substring(0, 100) };
            }
          }
        } catch(e) {
          results.push({ error: e.message, src: (iframe.src || '').substring(0, 100) });
        }
      }
      
      // Also check main page
      const mainText = document.body.innerText.substring(0, 500);
      const mainBtns = [...document.querySelectorAll('button, a, span')]
        .filter(el => {
          const t = (el.textContent || '').trim();
          return t === '同意' || t === '提交' || t === '通过' || t === '批准';
        })
        .map(el => el.textContent.trim());
      
      return { success: false, iframes: results, mainText, mainBtns };
    });
    
    log(`审批按钮: ${JSON.stringify(approvalResult, null, 2)}`);

    if (approvalResult.success) {
      log(`\n✓ 已点击 ${approvalResult.element} 按钮！`);
      await wait(5000);
      
      // Check result
      const resultCheck = await page.evaluate(async (sn) => {
        try {
          const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
          const text = await r.text();
          return text.includes(sn) ? 'STILL_PENDING' : 'APPROVED_OK';
        } catch(e) {
          return 'ERROR: ' + e.message;
        }
      }, targetSN);
      
      log(`审批结果: ${resultCheck}`);
    } else {
      log('\n⚠️ 未找到审批按钮');
      
      // Detailed iframe content
      if (approvalResult.iframes) {
        for (const fi of approvalResult.iframes) {
          if (fi.text) {
            log(`\n  iframe [${fi.src}]:`);
            log(`  ${fi.text.substring(0, 300)}`);
          }
        }
      }
      
      // Try deeper: check ExtJS button components
      log('\n检查ExtJS组件...');
      const extCheck = await page.evaluate(() => {
        try {
          const all = [];
          // Check all buttons in Ext
          const btns = Ext.ComponentQuery.query('button');
          for (const b of btns) {
            const t = b.getText ? b.getText() : (b.text || '');
            all.push({ text: t, disabled: b.disabled, hidden: b.hidden });
          }
          return all;
        } catch(e) {
          return [{ error: e.message }];
        }
      });
      log(`ExtJS按钮: ${JSON.stringify(extCheck)}`);
    }

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_final.png') });

  } catch (error) {
    log(`错误: ${error.message}`);
    log(error.stack);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_error.png') }).catch(() => {});
  } finally {
    await browser.close();
    log('\n=== 完成 ===');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
