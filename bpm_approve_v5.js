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
    // === Login - home page shows 待审批 by default ===
    log('登录...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(15000); // Give ExtJS time to fully initialize
    log(`标题: ${await page.title()}`);

    // === Get tasks via API ===
    log('获取待办列表...');
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
    tasks.forEach((t, i) => console.log(`  ${i+1}. [${t.SerialNum}] ${t.ProcessName} - ${t.Description}`));

    // Check if grid is visible
    const gridText = await page.evaluate(() => {
      const body = document.body.innerText || '';
      // Look for grid content markers
      const hasSN = /REQ\d+/.test(body);
      return { hasSN, preview: body.substring(0, 600) };
    });
    log(`Grid可见: ${gridText.hasSN}`);
    log(`首页内容:\n${gridText.preview}`);

    if (!gridText.hasSN) {
      log('⚠️ 待审批列表未加载，可能需要手动切换到待审批tab');
      await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_no_grid.png') });
      await browser.close();
      return;
    }

    const targetSN = tasks[0].SerialNum;
    log(`\n=== 审批: ${targetSN} ===`);

    // === Step 1: Select the row by clicking on it ===
    // ExtJS grid renders as divs with x-grid-item class
    log('选中行...');
    const selectResult = await page.evaluate((sn) => {
      // ExtJS grid rows are div.x-grid-item or div.x-grid-row
      const rows = document.querySelectorAll('.x-grid-item, .x-grid-row, [data-recordid]');
      for (const row of rows) {
        if (row.textContent.includes(sn)) {
          // Click on the row
          row.click();
          return { found: true, rowClass: row.className.substring(0, 50) };
        }
      }
      // Fallback: find any element containing the serial number
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.childNodes.length === 1 && 
            el.childNodes[0].nodeType === 3 && 
            el.textContent.trim() === sn) {
          // Walk up to find a grid row
          let p = el.parentElement;
          for (let i = 0; i < 15 && p; i++) {
            if (p.className && 
                (p.className.includes('x-grid-item') || 
                 p.className.includes('x-grid-row') || 
                 p.className.includes('x-grid-data'))) {
              p.click();
              return { found: true, parentClass: p.className.substring(0, 50) };
            }
            p = p.parentElement;
          }
          el.click();
          return { found: true, method: 'text click' };
        }
      }
      return { found: false, rows: rows.length };
    }, targetSN);
    log(`选中: ${JSON.stringify(selectResult)}`);
    await wait(2000);

    // === Step 2: Find toolbar buttons and check which are enabled ===
    const toolbarInfo = await page.evaluate(() => {
      // ExtJS toolbar areas
      const toolbars = document.querySelectorAll('.x-toolbar, [class*=toolbar], .x-grid-header-ct, .x-panel-header');
      const results = [];
      for (const tb of toolbars) {
        const btns = [...tb.querySelectorAll('a, button, span, div')]
          .filter(el => {
            const t = (el.textContent || '').trim();
            return t.length > 0 && t.length < 15;
          })
          .map(el => ({
            text: (el.textContent || '').trim(),
            tag: el.tagName,
            cls: (el.className || '').substring(0, 40)
          }));
        if (btns.length > 0) results.push({ cls: (tb.className || '').substring(0, 40), btns });
      }
      return results;
    });
    log(`工具栏: ${JSON.stringify(toolbarInfo, null, 2)}`);

    // === Step 3: Click "批量同意" ===
    log('点击批量同意...');
    const approveClick = await page.evaluate(() => {
      // Find "批量同意" anywhere on page
      const all = document.querySelectorAll('a, button, span, td, div');
      for (const el of all) {
        if (el.textContent.trim() === '批量同意') {
          // Walk up to find clickable element
          let target = el;
          for (let i = 0; i < 10 && target; i++) {
            if (target.tagName === 'A' || target.tagName === 'BUTTON') break;
            if (target.onclick) break;
            if (target.getAttribute('role') === 'button') break;
            // Check ExtJS classes
            const cls = target.className || '';
            if (cls.includes('x-btn')) break;
            target = target.parentElement;
          }
          // Dispatch both click and mousedown/mouseup for ExtJS
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return { clicked: '批量同意', tag: target.tagName, cls: (target.className || '').substring(0, 50) };
        }
      }
      return { notFound: true };
    });
    log(`结果: ${JSON.stringify(approveClick)}`);
    await wait(5000);

    // Screenshot to check state
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_after_approve_click.png') });

    // === Step 4: Check for dialog and confirm ===
    log('检查弹窗...');
    const pageState = await page.evaluate(() => {
      const body = document.body;
      const allText = (body.innerText || '').substring(0, 1000);
      
      // Look for dialog/message box
      const dialogs = [...document.querySelectorAll('.x-window, .x-message-box, [class*=dialog], [class*=msgbox], [class*=window]')]
        .filter(el => el.style.display !== 'none' && el.offsetParent !== null)
        .map(el => ({
          cls: (el.className || '').substring(0, 60),
          text: (el.innerText || '').substring(0, 300)
        }));
      
      return { allText, dialogs };
    });
    log(`页面状态: ${JSON.stringify(pageState, null, 2)}`);

    // Click confirm/确定 button in dialog
    if (pageState.allText.includes('是否') || pageState.allText.includes('确认') || 
        pageState.allText.includes('确定要') || pageState.dialogs.length > 0) {
      
      log('检测到确认弹窗，点击确定...');
      const confirmed = await page.evaluate(() => {
        const targets = ['确定', '是', '确认', '提交'];
        for (const text of targets) {
          const all = document.querySelectorAll('a, button, span');
          for (const el of all) {
            if (el.textContent.trim() === text && el.offsetParent !== null) {
              el.click();
              return 'clicked: ' + text;
            }
          }
        }
        return 'no confirm btn';
      });
      log(`确认: ${confirmed}`);
      await wait(4000);
    }

    // === Step 5: Check if "批量同意" opened a form - try to submit ===
    log('检查是否需要填写意见...');
    const formCheck = await page.evaluate(() => {
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (ta.offsetParent !== null) {
          ta.value = '同意';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          return { filled: true, placeholder: ta.placeholder };
        }
      }
      return { noTextarea: true };
    });
    log(`意见: ${JSON.stringify(formCheck)}`);

    // Try clicking submit/confirm again
    await page.evaluate(() => {
      for (const text of ['确定', '提交', '是', '确认', '同意']) {
        const all = document.querySelectorAll('a, button, span');
        for (const el of all) {
          if (el.textContent.trim() === text && el.offsetParent !== null) {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return;
          }
        }
      }
    });
    await wait(5000);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_final_state.png') });

    // === Step 6: Verify ===
    log('\n=== 验证 ===');
    const verify = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      if (!text.includes(sn)) return { approved: true };
      return { 
        approved: false, 
        count: text.split('"SerialNum"').length - 1,
        preview: text.substring(0, 300)
      };
    }, targetSN);
    
    log(`结果: ${JSON.stringify(verify)}`);
    
    if (verify.approved) {
      log(`\n✅✅✅ 审批成功！${targetSN} 已从待办列表移除`);
    } else {
      log(`\n⚠️ 审批未成功，任务仍在待办列表中 (共${verify.count}条)`);
      
      // Last resort: try opening the task form directly via URL
      log('\n最终方案: 直接导航到任务表单...');
      const taskID = tasks[0].TaskID;
      
      // Try common YZSoft BPM form URLs
      const formUrls = [
        `/YZSoft/Forms/Process.aspx?TaskID=${taskID}`,
        `/BPM2018/Workflow/TaskForm.aspx?TaskID=${taskID}`,
        `/BPM2018/BPM/TaskForm.aspx?TaskID=${taskID}`,
        `/YZSoft/Forms/TaskForm.aspx?TaskID=${taskID}`,
      ];
      
      for (const url of formUrls) {
        log(`尝试: ${url}`);
        try {
          await page.goto(BPM_URL + url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await wait(5000);
          const hasApprove = await page.evaluate(() => {
            const body = (document.body || {}).innerText || '';
            return body.includes('同意') || body.includes('提交') || body.includes('通过');
          });
          if (hasApprove) {
            log(`  ✓ 找到表单! 有审批按钮`);
            // Try to approve
            await page.evaluate(() => {
              for (const t of ['同意', '提交', '通过']) {
                const all = document.querySelectorAll('a, button, span, input');
                for (const el of all) {
                  if ((el.textContent || el.value || '').trim() === t) {
                    el.click(); return;
                  }
                }
              }
            });
            await wait(5000);
            break;
          } else {
            log(`  ✗ 无审批内容`);
          }
        } catch(e) {
          log(`  ✗ ${e.message.substring(0, 80)}`);
        }
      }
    }

  } catch (e) {
    log(`错误: ${e.message}`);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_error.png') }).catch(() => {});
  } finally {
    await browser.close();
    log('完成');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
