const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const REPORT_DIR = path.join(__dirname, '..', '..', 'reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN', ignoreHTTPSErrors: true
  });

  const page = await ctx.newPage();
  page.on('pageerror', err => log(`[ERR] ${err.message?.substring(0, 120)}`));

  try {
    log('登录...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for ExtJS to fully load - poll until grid appears
    log('等待ExtJS加载...');
    let gridReady = false;
    for (let i = 0; i < 20; i++) {
      await wait(3000);
      const state = await page.evaluate(() => {
        const extLoaded = typeof Ext !== 'undefined';
        const bodyHTML = (document.body ? document.body.innerHTML.length : 0);
        const bodyText = (document.body ? document.body.innerText : '');
        const hasGrid = bodyText.includes('REQ') || bodyText.includes('流水号');
        const hasTab = bodyText.includes('待审批');
        return { extLoaded, bodyHTML, bodyLen: bodyText.length, hasGrid, hasTab, 
                 preview: bodyText.substring(0, 150) };
      });
      log(`  尝试${i+1}: Ext=${state.extLoaded} HTML=${state.bodyHTML} Text=${state.bodyLen} Grid=${state.hasGrid} Tab=${state.hasTab}`);
      if (state.hasGrid) {
        gridReady = true;
        break;
      }
    }

    if (!gridReady) {
      log('Grid未加载，放弃');
      await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_not_loaded.png') });
      await browser.close();
      return;
    }

    // Get tasks via API
    log('\n获取待办...');
    const tasks = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
      return (JSON.parse(clean).children || []).map(t => ({
        SerialNum: t.SerialNum, TaskID: t.TaskID, StepID: t.StepID,
        ProcessName: t.ProcessName, Description: t.Description, NodeName: t.NodeName
      }));
    });

    if (tasks.length === 0) { log('无待办'); await browser.close(); return; }
    log(`${tasks.length}条待办`);

    // === APPROVE EACH TASK ===
    for (let idx = 0; idx < tasks.length; idx++) {
      const task = tasks[idx];
      log(`\n${'='.repeat(50)}`);
      log(`审批 [${idx+1}/${tasks.length}]: ${task.SerialNum} - ${task.Description}`);

      // Step 1: Find and select the grid row
      log('1. 选中行...');
      const selected = await page.evaluate((sn) => {
        // ExtJS grid items
        const items = document.querySelectorAll('.x-grid-item, .x-grid-row, [class*=grid-item], [class*=grid-data-row]');
        for (const item of items) {
          if (item.textContent.includes(sn)) {
            item.click();
            return true;
          }
        }
        // Try all elements
        for (const el of document.querySelectorAll('*')) {
          if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 && el.textContent.trim() === sn) {
            let p = el;
            for (let i = 0; i < 20 && p && p !== document.body; i++) {
              const c = p.className || '';
              if (c.includes('x-grid') || c.includes('grid-item') || c.includes('grid-row')) {
                p.click();
                return true;
              }
              p = p.parentElement;
            }
            el.click();
            return true;
          }
        }
        return false;
      }, task.SerialNum);
      log(`   选中: ${selected}`);
      await wait(1500);

      // Step 2: Click "批量同意" button
      log('2. 点击批量同意...');
      const clickedApprove = await page.evaluate(() => {
        // Find "批量同意" in toolbar area
        const allBtns = document.querySelectorAll('a, button, span, td.x-btn-mc, span.x-btn-inner');
        for (const el of allBtns) {
          if (el.textContent.trim() === '批量同意') {
            // Find the actual ExtJS button wrapper
            let btn = el;
            for (let i = 0; i < 15 && btn; i++) {
              const c = btn.className || '';
              const role = btn.getAttribute('role');
              if (c.includes('x-btn') || role === 'button' || btn.tagName === 'A') break;
              btn = btn.parentElement;
            }
            // Fire multiple events for ExtJS
            ['mousedown', 'mouseup', 'click'].forEach(evt => {
              btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true }));
            });
            return { success: true, tag: btn.tagName, cls: (btn.className||'').substring(0,50) };
          }
        }
        return { success: false };
      });
      log(`   ${JSON.stringify(clickedApprove)}`);
      await wait(4000);

      // Step 3: Handle any dialog
      log('3. 处理弹窗...');
      const dialogHandled = await page.evaluate(() => {
        const body = document.body;
        // Check for dialog/message box
        const dialogs = [...document.querySelectorAll('.x-window, .x-message-box, [class*=dialog]')];
        for (const dlg of dialogs) {
          const txt = dlg.innerText || '';
          if (txt.length > 0 && (txt.includes('是否') || txt.includes('确认') || txt.includes('同意') || txt.includes('提交'))) {
            // Find confirm button
            const btns = dlg.querySelectorAll('a, button, span');
            for (const b of btns) {
              const t = b.textContent.trim();
              if (t === '确定' || t === '是' || t === '确认') {
                ['mousedown','mouseup','click'].forEach(evt => {
                  b.dispatchEvent(new MouseEvent(evt, { bubbles: true }));
                });
                return { handled: true, btn: t, dlgText: txt.substring(0, 100) };
              }
            }
            return { found: true, txt: txt.substring(0, 200), btns: [...btns].map(b => b.textContent.trim()).filter(Boolean) };
          }
        }
        return { noDialog: true };
      });
      log(`   弹窗: ${JSON.stringify(dialogHandled)}`);
      await wait(3000);

      // Step 4: Fill in any comment textareas
      log('4. 填写意见...');
      await page.evaluate(() => {
        const textareas = document.querySelectorAll('textarea');
        for (const ta of textareas) {
          if (ta.offsetParent !== null && !ta.value) {
            ta.value = '同意';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      await wait(1000);

      // Step 5: Click final confirm if still needed
      await page.evaluate(() => {
        for (const text of ['确定', '确认', '提交', '是']) {
          const all = document.querySelectorAll('a, button, span');
          for (const el of all) {
            if (el.textContent.trim() === text && el.offsetParent !== null) {
              el.click(); return;
            }
          }
        }
      });
      await wait(4000);

      // Step 6: Verify
      const verify = await page.evaluate(async (sn) => {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
        return !r.text().includes(sn);
      }, task.SerialNum);
      
      if (verify) {
        log(`   ✅ 审批成功！`);
      } else {
        log(`   ⚠️ 仍在待办中`);
      }
    }

    // Final summary
    const remaining = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
      const d = JSON.parse(clean);
      return (d.children || []).map(t => t.SerialNum + ' ' + t.Description);
    });
    
    log(`\n${'='.repeat(50)}`);
    log(`最终剩余待办: ${remaining.length}条`);
    if (remaining.length > 0) remaining.forEach(r => log(`  - ${r}`));

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_final.png') });

  } catch (e) {
    log(`错误: ${e.message}\n${e.stack}`);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_error.png') }).catch(()=>{});
  } finally {
    await browser.close();
    log('完成');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
