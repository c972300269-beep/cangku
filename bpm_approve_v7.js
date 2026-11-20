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

  async function getWorklist() {
    return await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      if (!text || text.length < 10) return [];
      const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
      try {
        const d = JSON.parse(clean);
        return (d.children || []).map(t => ({
          SerialNum: t.SerialNum, TaskID: t.TaskID, StepID: t.StepID,
          ProcessName: t.ProcessName, Description: t.Description, NodeName: t.NodeName
        }));
      } catch(e) {
        return [];
      }
    });
  }

  try {
    log('登录...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for ExtJS grid
    log('等待加载...');
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await wait(3000);
      ready = await page.evaluate(() => {
        const txt = document.body ? document.body.innerText || '' : '';
        return txt.includes('REQ') && txt.includes('待审批');
      });
      if (ready) { log(`  ✓ 第${i+1}次, Grid已加载`); break; }
      log(`  ${i+1}...`);
    }
    if (!ready) { log('加载失败'); await browser.close(); return; }

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_loaded.png') });

    // Get tasks
    let tasks = await getWorklist();
    log(`待办: ${tasks.length}条`);
    tasks.forEach((t, i) => console.log(`  ${i+1}. [${t.SerialNum}] ${t.ProcessName} - ${t.Description}`));
    if (tasks.length === 0) { log('无待办'); await browser.close(); return; }

    // === Process each task ===
    for (let idx = 0; idx < tasks.length; idx++) {
      const task = tasks[idx];
      log(`\n${'='.repeat(60)}`);
      log(`处理 ${idx+1}/${tasks.length}: ${task.SerialNum}`);

      // 1. Select row
      await page.evaluate((sn) => {
        const items = document.querySelectorAll('.x-grid-item, .x-grid-row, [class*=grid-item]');
        for (const item of items) {
          if (item.textContent.includes(sn)) { item.click(); return; }
        }
      }, task.SerialNum);
      await wait(1500);
      log('  ✓ 选中行');

      // 2. Click 批量同意
      const clicked = await page.evaluate(() => {
        const all = document.querySelectorAll('a, button, span');
        for (const el of all) {
          if (el.textContent.trim() === '批量同意') {
            let btn = el;
            for (let i = 0; i < 10 && btn; i++) {
              if ((btn.className || '').includes('x-btn') || btn.tagName === 'A') break;
              btn = btn.parentElement;
            }
            ['mousedown','mouseup','click'].forEach(e => 
              btn.dispatchEvent(new MouseEvent(e, { bubbles: true })));
            return true;
          }
        }
        return false;
      });
      log(`  ✓ 批量同意: ${clicked}`);
      await wait(4000);
      await page.screenshot({ path: path.join(REPORT_DIR, `bpm_step1_${idx}.png`) });

      // 3. Handle dialogs - check what appeared
      const pageInfo = await page.evaluate(() => {
        const body = document.body.innerText || '';
        // Check for dialogs/windows
        const dlgEls = [...document.querySelectorAll('.x-window, .x-message-box, [class*=dialog], [class*=msgbox]')]
          .filter(el => el.offsetParent !== null);
        const dlgTexts = dlgEls.map(el => el.innerText.substring(0, 300));
        
        // Find textareas
        const textareas = [...document.querySelectorAll('textarea')]
          .filter(ta => ta.offsetParent !== null);
        
        // Find visible buttons with confirm text
        const confirmBtns = [...document.querySelectorAll('a, button, span')]
          .filter(el => {
            const t = el.textContent.trim();
            return (t === '确定' || t === '是' || t === '确认' || t === '提交' || t === '同意') && el.offsetParent !== null;
          })
          .map(el => el.textContent.trim());
        
        return { 
          hasDialog: dlgTexts.length > 0, 
          dlgTexts, 
          textareas: textareas.length,
          confirmBtns,
          bodyPreview: body.substring(body.indexOf('REQ') > 0 ? body.indexOf('REQ') - 50 : 0, 600)
        };
      });
      log(`  页面状态: ${JSON.stringify(pageInfo, null, 2)}`);

      // 4. If dialog appeared, confirm it
      if (pageInfo.hasDialog || pageInfo.confirmBtns.length > 0) {
        log('  处理确认弹窗...');
        await page.evaluate(() => {
          for (const text of ['确定', '是', '确认', '提交', '同意']) {
            for (const el of document.querySelectorAll('a, button, span')) {
              if (el.textContent.trim() === text && el.offsetParent !== null) {
                ['mousedown','mouseup','click'].forEach(e =>
                  el.dispatchEvent(new MouseEvent(e, { bubbles: true })));
                return;
              }
            }
          }
        });
        await wait(3000);
        await page.screenshot({ path: path.join(REPORT_DIR, `bpm_step2_${idx}.png`) });
      }

      // 5. If there are textareas, fill them
      if (pageInfo.textareas > 0) {
        log('  填写审批意见...');
        await page.evaluate(() => {
          for (const ta of document.querySelectorAll('textarea')) {
            if (ta.offsetParent !== null) {
              ta.value = '同意';
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              ta.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          // Click confirm after filling
          for (const text of ['确定', '提交', '是', '确认']) {
            for (const el of document.querySelectorAll('a, button, span')) {
              if (el.textContent.trim() === text && el.offsetParent !== null) {
                el.click(); return;
              }
            }
          }
        });
        await wait(4000);
      }

      // 6. Check if task was removed
      const remaining = await getWorklist();
      const stillThere = remaining.some(t => t.SerialNum === task.SerialNum);
      
      if (!stillThere) {
        log(`  ✅✅✅ 审批成功！${task.SerialNum} 已移除`);
      } else {
        log(`  ⚠️ 仍在待办 (共${remaining.length}条)`);
      }
    }

    // Final check
    const final = await getWorklist();
    log(`\n${'='.repeat(60)}`);
    log(`完成。剩余待办: ${final.length}条`);
    final.forEach(t => log(`  - ${t.SerialNum} ${t.Description}`));

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_done.png') });

  } catch (e) {
    log(`错误: ${e.message}\n${e.stack}`);
  } finally {
    await browser.close();
    log('结束');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
