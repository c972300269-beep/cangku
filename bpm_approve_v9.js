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

  try {
    log('登录...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(15000);

    // Get worklist
    const tasks = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
      return (JSON.parse(clean).children || []).map(t => ({
        SerialNum: t.SerialNum, TaskID: t.TaskID, StepID: t.StepID,
        ProcessName: t.ProcessName, ProcessVersion: t.ProcessVersion,
        Description: t.Description, NodeName: t.NodeName,
        pid: t.ProcessInstanceID, // try different field names
        ProcessID: t.ProcessID,
        ProcessInstanceID: t.ProcessInstanceID,
      }));
    });
    
    log(`${tasks.length}条待办`);
    tasks.forEach(t => console.log(`  [${t.SerialNum}] TaskID=${t.TaskID} StepID=${t.StepID}`));

    // Get full task info to find process instance ID
    if (tasks.length > 0) {
      const task = tasks[0];
      log(`\n获取任务详细信息 TaskID=${task.TaskID}...`);
      
      const taskInfo = await page.evaluate(async (taskID) => {
        const r = await fetch('/YZSoft.Services.REST/BPM/Task.ashx?method=GetTaskInfo&TaskID=' + taskID + '&_dc=' + Date.now(), { credentials: 'include' });
        return await r.text();
      }, task.TaskID);
      log(`TaskInfo: ${taskInfo.substring(0, 500)}`);

      // Also try GetTaskAllInfo
      const allInfo = await page.evaluate(async (taskID) => {
        try {
          const r = await fetch('/YZSoft.Services.REST/BPM/Task.ashx?method=GetTaskAllInfo&TaskID=' + taskID + '&_dc=' + Date.now(), { credentials: 'include' });
          return await r.text();
        } catch(e) { return 'error: ' + e.message; }
      }, task.TaskID);
      log(`AllInfo: ${allInfo.substring(0, 500)}`);

      // Try GetProcessInfo
      log('\n获取流程信息...');
      // Need process instance ID - try to parse from task info
      try {
        const parsed = JSON.parse(taskInfo.replace(/new Date\([^)]+\)/g, '"date"'));
        log(`解析后的TaskInfo字段: ${Object.keys(parsed).join(', ')}`);
        log(`值: ${JSON.stringify(parsed)}`);
        
        const pid = parsed.ProcessInstanceID || parsed.PID || parsed.ProcessID || parsed.processInstanceID;
        if (pid) {
          log(`找到ProcessInstanceID: ${pid}`);
          
          // Try to open form directly
          const formUrls = [
            `/YZSoft/Forms/Process.aspx?pid=${pid}&TaskID=${task.TaskID}`,
            `/YZSoft/Forms/Process.aspx?pid=${pid}`,
            `/YZSoft/Forms/Task.aspx?TaskID=${task.TaskID}`,
            `/YZSoft/Forms/Form.aspx?TaskID=${task.TaskID}`,
            `/BPM2018/BPM/Portal/TaskForm.aspx?TaskID=${task.TaskID}`,
          ];
          
          for (const url of formUrls) {
            log(`\n尝试表单URL: ${url}`);
            try {
              await page.goto(BPM_URL + url, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await wait(5000);
              
              const pageContent = await page.evaluate(() => {
                const body = document.body ? document.body.innerText || '' : '';
                return {
                  len: body.length,
                  is404: body.includes('无法找到资源') || body.includes('404'),
                  hasForm: body.includes('同意') || body.includes('提交') || body.includes('审批'),
                  hasError: body.includes('错误') || body.includes('Error'),
                  preview: body.substring(0, 500)
                };
              });
              log(`  结果: len=${pageContent.len} 404=${pageContent.is404} form=${pageContent.hasForm} error=${pageContent.hasError}`);
              
              if (pageContent.hasForm) {
                log(`  ✅ 找到表单！`);
                log(`  内容: ${pageContent.preview}`);
                
                // Try to approve!
                log('\n  尝试审批...');
                const approved = await page.evaluate(() => {
                  for (const text of ['同意', '提交', '通过', '批准']) {
                    for (const el of document.querySelectorAll('button, a, span, input[type=button], input[type=submit]')) {
                      const t = (el.textContent || el.value || '').trim();
                      if (t === text) {
                        el.click();
                        return 'clicked: ' + text;
                      }
                    }
                  }
                  return 'not found';
                });
                log(`  审批: ${approved}`);
                await wait(4000);
                
                // Check for confirmation
                await page.evaluate(() => {
                  for (const text of ['确定', '是', '确认']) {
                    for (const el of document.querySelectorAll('button, a, span')) {
                      if (el.textContent.trim() === text) {
                        el.click(); return;
                      }
                    }
                  }
                });
                await wait(3000);
                await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_form_approved.png') });
                break;
              }
            } catch(e) {
              log(`  ✗ ${e.message.substring(0, 80)}`);
            }
          }
        }
      } catch(e) {
        log(`解析失败: ${e.message}`);
      }
    }

    // Final check
    const remaining = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
      const d = JSON.parse(clean);
      return (d.children || []).map(t => t.SerialNum);
    });

    log(`\n最终待办: ${remaining.length}条 - ${remaining.join(', ') || '无'}`);

  } catch (e) {
    log(`错误: ${e.message}`);
  } finally {
    await browser.close();
    log('完成');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
