const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  try {
    // Step 1: Login
    log('登录BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 10000));
    log(`登录后标题: ${await page.title()}`);

    // Step 2: Get pending tasks
    log('\n获取待办任务列表...');
    const worklistRaw = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      return await r.text();
    });

    // Clean new Date() format
    const clean = worklistRaw.replace(/new Date\(([^)]+)\)/g, (m, args) => {
      const parts = args.split(',').map(p => parseInt(p.trim()));
      const d = new Date(parts[0], parts[1], parts[2], parts[3]||0, parts[4]||0, parts[5]||0);
      return '"' + d.toISOString() + '"';
    });

    let data;
    try { data = JSON.parse(clean); } catch(e) { 
      log(`解析失败: ${e.message}`); 
      log(`原始: ${worklistRaw.substring(0, 500)}`);
      return;
    }

    const tasks = data.children || [];
    log(`待办任务数: ${tasks.length}`);

    if (tasks.length === 0) {
      log('没有待办任务。');
      return;
    }

    // Step 3: List all tasks
    console.log('\n=== 当前待办任务 ===');
    tasks.forEach((t, i) => {
      console.log(`${i+1}. [${t.SerialNum}] ${t.ProcessName} - ${t.Description || ''}`);
      console.log(`   TaskID=${t.TaskID} StepID=${t.StepID} 节点=${t.NodeName}`);
      console.log(`   接收时间=${t.ReceiveAt}`);
    });

    // Step 4: Try to find the approval API
    // YZSoft BPM typically has these approval endpoints:
    log('\n=== 查找审批API ===');

    // 4a. Try Task.ashx methods
    const taskMethods = ['CompleteTask', 'Submit', 'Approve', 'Process', 'Execute',
                         'Complete', 'FinishTask', 'DoTask', 'HandleTask', 'RunTask'];
    
    if (tasks.length > 0) {
      const testTask = tasks[0];
      log(`用 TaskID=${testTask.TaskID} 测试审批API...`);
      
      for (const method of taskMethods) {
        try {
          const result = await page.evaluate(async (taskID, method) => {
            const r = await fetch(`/YZSoft.Services.REST/BPM/Task.ashx?method=${method}&TaskID=${taskID}&_dc=` + Date.now(), { 
              credentials: 'include',
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: 'comment=同意'
            });
            const text = await r.text();
            return { method, status: r.status, text: text.substring(0, 300) };
          }, testTask.TaskID, method);
          
          if (result.status === 200 && !result.text.includes('未知的命令')) {
            log(`  ✓ ${method}: ${result.text}`);
          } else if (result.text.includes('未知的命令')) {
            // Skip unknown commands
          } else {
            log(`  ? ${method}: [${result.status}] ${result.text}`);
          }
        } catch(e) {
          // silently skip
        }
      }
    }

    // 4b. Try Form.ashx
    log('\n尝试 Form.ashx API...');
    const formMethods = ['Submit', 'Save', 'Complete', 'Approve', 'Process', 'Post', 'Execute'];
    for (const method of formMethods) {
      try {
        const result = await page.evaluate(async (method) => {
          const r = await fetch(`/YZSoft.Services.REST/BPM/Form.ashx?method=${method}&_dc=` + Date.now(), { 
            credentials: 'include',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'comment=同意'
          });
          const text = await r.text();
          return { method, status: r.status, text: text.substring(0, 300) };
        }, method);
        if (result.status === 200 && !result.text.includes('未知的命令')) {
          log(`  ✓ ${method}: ${result.text}`);
        }
      } catch(e) {}
    }

    // 4c. Try Workflow.ashx  
    log('\n尝试 Workflow.ashx API...');
    const wfMethods = ['Submit', 'Complete', 'Approve', 'Process', 'Execute'];
    for (const method of wfMethods) {
      try {
        const result = await page.evaluate(async (method) => {
          const r = await fetch(`/BPM2018/Workflow/Workflow.ashx?method=${method}&_dc=` + Date.now(), { 
            credentials: 'include',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'comment=同意'
          });
          const text = await r.text();
          return { method, status: r.status, text: text.substring(0, 300) };
        }, method);
        if (result.status === 200 && !result.text.includes('未知的命令')) {
          log(`  ✓ ${method}: ${result.text}`);
        }
      } catch(e) {}
    }

    // 4d. Try opening a task form and capturing API calls
    log('\n=== 打开第一个任务表单，拦截审批API ===');
    
    // Navigate to task list page
    await page.goto(`${BPM_URL}/BPM2018/Workflow/TaskList.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 10000));
    
    // Double click first task to open it
    const sn = tasks[0].SerialNum;
    log(`打开任务: ${sn}`);
    
    await page.evaluate((serialNum) => {
      // ExtJS: find the grid row and double-click
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
          if (row.textContent.includes(serialNum)) {
            const evt = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
            row.dispatchEvent(evt);
            return true;
          }
        }
      }
      return false;
    }, sn);
    
    await new Promise(r => setTimeout(r, 8000));
    
    // Check what opened
    const pageState = await page.evaluate(() => {
      const iframes = [...document.querySelectorAll('iframe')].map(f => ({
        src: f.src,
        id: f.id,
        name: f.name
      }));
      const tabs = [...document.querySelectorAll('.x-tab-strip-text, .x-tab, [class*=tab]')].map(t => t.textContent.trim()).filter(Boolean);
      const windows = [...document.querySelectorAll('.x-window, [class*=window]')].map(w => ({
        title: (w.querySelector('.x-window-header-text, [class*=header]')?.textContent || '').trim(),
        visible: w.style.display !== 'none'
      }));
      return { iframes, tabs, windows, bodyLen: document.body.textContent.length };
    });
    log(`页面状态: ${JSON.stringify(pageState, null, 2)}`);

    // Check if there's a form iframe and try to find approval elements
    const formInfo = await page.evaluate(() => {
      const results = {};
      const allIframes = document.querySelectorAll('iframe');
      for (const iframe of allIframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          const body = doc.body;
          if (!body) continue;
          
          const text = body.innerText.substring(0, 500);
          const buttons = [...body.querySelectorAll('button, input[type=button], input[type=submit], a, span.x-btn-inner, .x-btn-text')]
            .map(b => ({ text: (b.textContent || b.value || '').trim(), tag: b.tagName }))
            .filter(b => b.text.length > 0 && b.text.length < 20);
          
          results[iframe.id || iframe.name || 'unknown'] = { text, buttons };
        } catch(e) {}
      }
      // Also check main page
      const mainBtns = [...document.body.querySelectorAll('button, input[type=button], input[type=submit], a, span.x-btn-inner, .x-btn-text')]
        .map(b => ({ text: (b.textContent || b.value || '').trim(), tag: b.tagName }))
        .filter(b => b.text.length > 0 && b.text.length < 20);
      results['_main'] = { text: document.body.innerText.substring(0, 500), buttons: mainBtns };
      return results;
    });
    
    log(`表单内容: ${JSON.stringify(formInfo, null, 2)}`);

    // Save screenshot
    await page.screenshot({ path: path.join(OUTPUT_DIR, '..', '..', 'reports', 'bpm_task_form.png') });
    log('截图保存: reports/bpm_task_form.png');

  } catch (error) {
    log(`错误: ${error.message}`);
    log(error.stack);
  } finally {
    await browser.close();
    log('\n=== 完成 ===');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
