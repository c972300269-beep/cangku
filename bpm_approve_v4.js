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
    await wait(12000);

    // Get tasks
    log('获取待办...');
    const tasks = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
      const d = JSON.parse(clean);
      return (d.children || []).map(t => ({
        SerialNum: t.SerialNum, TaskID: t.TaskID, StepID: t.StepID,
        ProcessName: t.ProcessName, Description: t.Description, NodeName: t.NodeName
      }));
    });

    if (tasks.length === 0) { log('无待办'); await browser.close(); return; }
    log(`${tasks.length}条待办`);
    tasks.forEach((t, i) => console.log(`  ${i+1}. [${t.SerialNum}] ${t.ProcessName} - ${t.Description}`));

    // Navigate to 待审批 tab via DOM
    log('\n打开待审批tab...');
    await page.evaluate(() => {
      const all = document.querySelectorAll('.x-tab, .x-tab-default, [class*=tab]');
      for (const el of all) {
        if (el.textContent.includes('待审批') && !el.textContent.includes('已审批') && !el.textContent.includes('流程')) {
          el.click(); return;
        }
      }
    });
    await wait(5000);

    // Verify grid is loaded by checking page text
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    log(`页面含待审批行: ${bodyText.includes(tasks[0].SerialNum)}`);

    // Now try to select the row via DOM click on the exact grid cell
    const targetSN = tasks[0].SerialNum;
    log(`\n处理: ${targetSN}`);

    // Method A: Click directly on the serial number cell
    const clickCell = await page.evaluate((sn) => {
      // Find a table cell containing the serial number
      const tds = document.querySelectorAll('td');
      for (const td of tds) {
        if (td.textContent.trim() === sn) {
          // Click the row (parent tr)
          const tr = td.closest('tr');
          if (tr) {
            tr.click();
            return { method: 'tr click', text: tr.textContent.substring(0, 100) };
          }
          td.click();
          return { method: 'td click' };
        }
      }
      // Try all elements
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 && el.textContent.trim() === sn) {
          el.click();
          return { method: 'text node click' };
        }
      }
      return { method: 'not found', tds: tds.length };
    }, targetSN);
    log(`选中: ${JSON.stringify(clickCell)}`);

    await wait(2000);

    // Check if row is selected (look for selected CSS class, etc.)
    const isSelected = await page.evaluate(() => {
      const sel = document.querySelectorAll('.x-grid-row-selected, .x-grid-item-selected, .selected, [class*=selected]');
      return sel.length;
    });
    log(`选中行标记: ${isSelected}`);

    // Click toolbar button "批量同意" or "同意"
    log('点击审批按钮...');
    const btnClick = await page.evaluate(() => {
      const all = document.querySelectorAll('a, button, span, td, div');
      for (const el of all) {
        const t = (el.textContent || '').trim();
        if (t === '批量同意') {
          // Try to find the actual clickable button
          let target = el;
          for (let i = 0; i < 10 && target; i++) {
            if (target.tagName === 'A' || target.tagName === 'BUTTON') break;
            if (target.getAttribute('role') === 'button') break;
            if (target.onclick) break;
            target = target.parentElement;
          }
          target.click();
          return 'clicked 批量同意 via ' + target.tagName;
        }
      }
      return 'not found';
    });
    log(`按钮: ${btnClick}`);
    await wait(4000);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_clicked_approve.png') });

    // Handle any dialog
    log('处理弹窗...');
    const dialog = await page.evaluate(() => {
      const body = document.body.innerText || '';
      if (body.includes('是否') || body.includes('确认') || body.includes('确定要')) {
        // Find confirm buttons
        const btns = document.querySelectorAll('a, button, span');
        for (const b of btns) {
          const t = (b.textContent || '').trim();
          if (t === '确定' || t === '是') {
            // Find clickable wrapper
            let target = b;
            for (let i = 0; i < 10 && target; i++) {
              if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') break;
              target = target.parentElement;
            }
            target.click();
            return { clicked: t };
          }
        }
        return { needConfirm: body.substring(0, 300) };
      }
      return { noDialog: true };
    });
    log(`弹窗: ${JSON.stringify(dialog)}`);

    await wait(3000);

    // Check if there's a "reason" textarea and confirm
    log('检查意见框...');
    const commentCheck = await page.evaluate(() => {
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (!ta.value) ta.value = '同意'; // Fill in approve reason
        return { filled: true };
      }
      const inputs = document.querySelectorAll('input[type=text]');
      for (const inp of inputs) {
        if (!inp.value && inp.offsetParent !== null) inp.value = '同意';
      }
      return { noTextarea: true };
    });
    log(`意见: ${JSON.stringify(commentCheck)}`);

    // Try clicking confirm again if there's a dialog
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('a, button, span')) {
        const t = (el.textContent || '').trim();
        if (t === '确定' || t === '是' || t === '提交' || t === '确认') {
          let target = el;
          for (let i = 0; i < 10 && target; i++) {
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.getAttribute('role') === 'button' || target.onclick) break;
            target = target.parentElement;
          }
          target.click();
          break;
        }
      }
    });
    await wait(4000);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_final_check.png') });

    // Verify
    log('\n验证结果...');
    const verify = await page.evaluate(async (sn) => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      return !text.includes(sn);
    }, targetSN);
    
    if (verify) {
      log(`✅ 审批成功！${targetSN} 已从待办移除`);
    } else {
      log(`⚠️ 任务仍在待办中，可能需要打开表单内部操作`);
    }

    // If still pending, try double-click to open form
    if (!verify) {
      log('\n尝试打开表单审批...');
      
      // Double click the row to open form
      await page.evaluate((sn) => {
        const tds = document.querySelectorAll('td');
        for (const td of tds) {
          if (td.textContent.trim() === sn) {
            const tr = td.closest('tr');
            if (tr) {
              tr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
              return;
            }
          }
        }
      });
      await wait(8000);
      await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_form_opened.png') });

      // Check form content for approve elements
      const formState = await page.evaluate(() => {
        const iframes = [...document.querySelectorAll('iframe')];
        const results = [];
        for (const f of iframes) {
          try {
            const doc = f.contentDocument || f.contentWindow.document;
            if (!doc || !doc.body) continue;
            const txt = doc.body.innerText || '';
            const btns = [...doc.querySelectorAll('button, a, input[type=button], input[type=submit], span')]
              .map(el => (el.textContent || el.value || '').trim())
              .filter(t => t.length > 0 && t.length < 20);
            results.push({ src: (f.src || '').substring(0, 100), text: txt.substring(0, 500), btns });
          } catch(e) {}
        }
        // Main page
        const mainBtns = [...document.querySelectorAll('button, a, span')]
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 0 && t.length < 20);
        return { iframes: results, mainBtns };
      });
      log(`表单: ${JSON.stringify(formState, null, 2)}`);

      // Try to find and click approve in form
      for (const fi of formState.iframes || []) {
        if (fi.text && (fi.text.includes('同意') || fi.text.includes('提交'))) {
          log(`找到表单iframe: ${fi.src}`);
          // Click approve in iframe
          const iframeApprove = await page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            for (const f of iframes) {
              try {
                const doc = f.contentDocument || f.contentWindow.document;
                if (!doc) continue;
                const all = doc.querySelectorAll('a, button, span, input');
                for (const el of all) {
                  const t = (el.textContent || el.value || '').trim();
                  if (t === '同意' || t === '提交' || t === '通过') {
                    el.click();
                    return 'clicked in iframe: ' + t;
                  }
                }
              } catch(e) {}
            }
            return 'not found in iframe';
          });
          log(`iframe审批: ${iframeApprove}`);
          await wait(3000);
          break;
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
