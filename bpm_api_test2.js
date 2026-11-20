const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Login via NT auth
    log('Logging in...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(10000);

    // Try many more method names on Process.ashx and Task.ashx
    log('\n=== Testing API methods ===');
    
    const results = await page.evaluate(async () => {
      const results = {};
      
      // Process.ashx methods
      const processMethods = [
        'GetProcessList', 'GetProcess', 'GetProcessStatus', 'QueryProcess', 'SearchProcess',
        'GetProcessByAccount', 'GetStartByAccount', 'GetMyStartProcess', 'GetMyProcessList',
        'GetMyStart', 'GetStarted', 'GetStartList', 'GetStart', 'GetMyStartList',
        'GetByStartUser', 'GetByAccount', 'GetInitiated', 'GetMyInitiated',
        'GetProcessInstance', 'GetInstance', 'GetInstances', 'GetProcessInstances',
        'GetRunningProcess', 'GetMyRunningProcess', 'GetRunning', 'GetMyRunning',
        'GetProcessInfo', 'GetFlowList', 'GetMyFlow', 'GetFlow',
      ];
      
      for (const method of processMethods) {
        try {
          const params = new URLSearchParams({
            method: method,
            start: '0',
            limit: '50',
            _dc: Date.now().toString()
          });
          const res = await fetch('/YZSoft.Services.REST/BPM/Process.ashx?' + params.toString(), { credentials: 'include' });
          const text = await res.text();
          results['Process_' + method] = { status: res.status, length: text.length, snippet: text.substring(0, 800) };
        } catch (e) {
          results['Process_' + method] = { error: e.message };
        }
      }
      
      // Task.ashx methods  
      const taskMethods = [
        'GetTask', 'GetTaskList', 'GetTaskInfo', 'GetTaskHistory', 'GetHistory',
        'GetProcessSteps', 'GetProcessInfo', 'GetStepInfo', 'GetSteps',
        'GetTrace', 'GetProcessTrace', 'GetFlowTrace', 'GetApprovalTrace',
        'GetMyStart', 'GetMyTask', 'GetMyProcess', 'GetStartList',
        'GetProcessed', 'GetProcessedTask', 'GetCompleted', 'GetApproved',
      ];
      
      for (const method of taskMethods) {
        try {
          const params = new URLSearchParams({
            method: method,
            start: '0',
            limit: '50',
            _dc: Date.now().toString()
          });
          const res = await fetch('/YZSoft.Services.REST/BPM/Task.ashx?' + params.toString(), { credentials: 'include' });
          const text = await res.text();
          results['Task_' + method] = { status: res.status, length: text.length, snippet: text.substring(0, 800) };
        } catch (e) {
          results['Task_' + method] = { error: e.message };
        }
      }

      // TaskList.ashx with more methods
      const taskListMethods = [
        'GetProcessed', 'GetProcessedTask', 'GetCompleted', 'GetApproved',
        'GetMyStart', 'GetStart', 'GetStartList', 'GetMyProcess',
        'GetProcessedList', 'GetApprovedList', 'GetHistory', 'GetHistoryList',
      ];
      
      for (const method of taskListMethods) {
        try {
          const params = new URLSearchParams({
            method: method,
            start: '0',
            limit: '50',
            _dc: Date.now().toString()
          });
          const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString(), { credentials: 'include' });
          const text = await res.text();
          results['TaskList_' + method] = { status: res.status, length: text.length, snippet: text.substring(0, 800) };
        } catch (e) {
          results['TaskList_' + method] = { error: e.message };
        }
      }

      // Try Main.ashx
      try {
        const res = await fetch('/BPM2018/BPM/Portal/Main.ashx?_dc=' + Date.now(), { credentials: 'include' });
        const text = await res.text();
        results['Main_ashx'] = { status: res.status, length: text.length, snippet: text.substring(0, 2000) };
      } catch (e) {
        results['Main_ashx'] = { error: e.message };
      }

      // Try other potential endpoints
      const otherEndpoints = [
        '/YZSoft.Services.REST/BPM/Step.ashx?method=GetStepList',
        '/YZSoft.Services.REST/BPM/Step.ashx?method=GetSteps',
        '/YZSoft.Services.REST/BPM/History.ashx?method=GetHistory',
        '/YZSoft.Services.REST/BPM/History.ashx?method=GetList',
        '/YZSoft.Services.REST/BPM/Trace.ashx?method=GetTrace',
        '/YZSoft.Services.REST/BPM/Approval.ashx?method=GetList',
        '/YZSoft.Services.REST/BPM/Approval.ashx?method=GetApprovalList',
        '/YZSoft.Services.REST/BPM/MyStart.ashx?method=GetList',
        '/YZSoft.Services.REST/BPM/StartProcess.ashx?method=GetList',
      ];
      
      for (const ep of otherEndpoints) {
        try {
          const res = await fetch(ep + '&start=0&limit=50&_dc=' + Date.now(), { credentials: 'include' });
          const text = await res.text();
          if (res.status !== 404) {
            results[ep] = { status: res.status, length: text.length, snippet: text.substring(0, 800) };
          }
        } catch (e) {}
      }
      
      return results;
    });

    // Print successful results
    let foundEndpoints = [];
    for (const [key, info] of Object.entries(results)) {
      if (info.status === 200 && info.length > 100 && !info.snippet.includes('未知的命令') && !info.snippet.includes('access denied') && !info.snippet.includes('参数Method')) {
        log(`✓✓✓ ${key}: status=${info.status}, length=${info.length}`);
        log(`  ${info.snippet.substring(0, 500)}`);
        foundEndpoints.push(key);
      } else if (info.status === 200 && !info.snippet.includes('未知的命令') && !info.snippet.includes('access denied') && !info.snippet.includes('参数Method')) {
        log(`✓ ${key}: status=${info.status}, length=${info.length}`);
        log(`  ${info.snippet.substring(0, 300)}`);
      }
    }
    
    log(`\n=== Successful endpoints with data: ${foundEndpoints.length} ===`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'api_method_tests.json'), JSON.stringify(results, null, 2));

    // For any successful endpoint, fetch full data
    for (const key of foundEndpoints) {
      log(`\nFetching full data from: ${key}`);
      
      // Parse key to get endpoint and method
      let endpoint, method;
      if (key.startsWith('Process_')) {
        endpoint = '/YZSoft.Services.REST/BPM/Process.ashx';
        method = key.replace('Process_', '');
      } else if (key.startsWith('Task_')) {
        endpoint = '/YZSoft.Services.REST/BPM/Task.ashx';
        method = key.replace('Task_', '');
      } else if (key.startsWith('TaskList_')) {
        endpoint = '/YZSoft.Services.REST/BPM/TaskList.ashx';
        method = key.replace('TaskList_', '');
      } else {
        continue;
      }
      
      const fullData = await page.evaluate(async (ep, m) => {
        const params = new URLSearchParams({
          method: m,
          start: '0',
          limit: '500',
          _dc: Date.now().toString()
        });
        const res = await fetch(ep + '?' + params.toString(), { credentials: 'include' });
        return await res.text();
      }, endpoint, method);
      
      const safeKey = key.replace(/[^a-zA-Z0-9]/g, '_');
      fs.writeFileSync(path.join(OUTPUT_DIR, `fulldata_${safeKey}.json`), fullData);
      log(`Data length: ${fullData.length}`);
      log(`Preview: ${fullData.substring(0, 1000)}`);
    }

  } catch (error) {
    log(`ERROR: ${error.message}`);
    log(error.stack);
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
