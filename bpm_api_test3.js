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
    log('Logging in...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(10000);

    // Get the module tree from Main.ashx
    log('\n=== Getting module tree from Main.ashx ===');
    const moduleTree = await page.evaluate(async () => {
      const res = await fetch('/BPM2018/BPM/Portal/Main.ashx?method=GetModuleTree&_dc=' + Date.now(), { credentials: 'include' });
      return await res.text();
    });
    log(`Module tree response: ${moduleTree.substring(0, 5000)}`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'main_module_tree.json'), moduleTree);

    // Also try other Main.ashx methods
    log('\n=== Trying Main.ashx methods ===');
    const mainMethods = await page.evaluate(async () => {
      const results = {};
      const methods = ['GetModuleTree', 'GetConfig', 'GetPortal', 'GetMenu', 'GetNavigation', 'GetTree', 
                       'GetModules', 'GetTabs', 'GetStartMenu', 'GetNav', 'GetSideMenu', 'GetFunctions',
                       'GetFuncTree', 'GetApps', 'GetMyStart', 'GetWorklist', 'GetTaskList'];
      
      for (const method of methods) {
        try {
          const res = await fetch('/BPM2018/BPM/Portal/Main.ashx?method=' + method + '&_dc=' + Date.now(), { credentials: 'include' });
          const text = await res.text();
          results[method] = { status: res.status, length: text.length, snippet: text.substring(0, 1500) };
        } catch (e) {
          results[method] = { error: e.message };
        }
      }
      return results;
    });

    for (const [method, info] of Object.entries(mainMethods)) {
      if (info.status === 200 && info.length > 50 && !info.snippet.includes('未知的命令')) {
        log(`✓ ${method}: status=${info.status}, length=${info.length}`);
        log(`  ${info.snippet.substring(0, 1000)}`);
      }
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'main_methods.json'), JSON.stringify(mainMethods, null, 2));

    // Try to find "我发起的流程" in the module tree and get its API endpoint
    log('\n=== Parsing module tree for "我发起的流程" ===');
    let parsedTree;
    try {
      parsedTree = JSON.parse(moduleTree);
    } catch (e) {
      log(`Failed to parse module tree: ${e.message}`);
      parsedTree = [];
    }

    function findModule(items, searchText) {
      for (const item of items) {
        if (item.text && item.text.includes(searchText)) return item;
        if (item.children) {
          const found = findModule(item.children, searchText);
          if (found) return found;
        }
        if (item.items) {
          const found = findModule(item.items, searchText);
          if (found) return found;
        }
      }
      return null;
    }

    const myStartModule = findModule(parsedTree, '我发起') || findModule(parsedTree, '发起') || findModule(parsedTree, '我的');
    if (myStartModule) {
      log(`Found "我发起的流程" module: ${JSON.stringify(myStartModule, null, 2)}`);
    } else {
      log(`Module tree: ${JSON.stringify(parsedTree, null, 2).substring(0, 5000)}`);
    }

    // Based on module tree, try to access the module's API
    // Common YZSoft BPM module API patterns:
    log('\n=== Trying to access module-specific APIs ===');
    
    // Try Main.ashx with method=GetModuleTree and look for module URLs
    // Also try direct URL patterns for "我发起的流程"
    const moduleApis = await page.evaluate(async () => {
      const results = {};
      
      // Try different URL patterns that might serve "我发起的流程"
      const urls = [
        '/BPM2018/BPM/Portal/Main.ashx?method=GetWorkList&start=0&limit=50',
        '/BPM2018/BPM/Portal/Main.ashx?method=GetMyStart&start=0&limit=50',
        '/BPM2018/BPM/Portal/Main.ashx?method=GetMyStartList&start=0&limit=50',
        '/BPM2018/BPM/Portal/Main.ashx?method=GetStartList&start=0&limit=50',
        '/BPM2018/BPM/Portal/Main.ashx?method=GetMyProcess&start=0&limit=50',
        '/BPM2018/BPM/Portal/Main.ashx?method=GetProcessList&start=0&limit=50',
        '/BPM2018/BPM/Portal/Main.ashx?method=GetMyApply&start=0&limit=50',
        // Try TaskList with different filter parameters
        '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&filter=' + encodeURIComponent(JSON.stringify({OwnerAccount: 'chenjialin3'})),
        // Try with type parameter
        '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&type=mystart',
        '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&type=myprocess',
      ];
      
      for (const url of urls) {
        try {
          const res = await fetch(url + '&_dc=' + Date.now(), { credentials: 'include' });
          const text = await res.text();
          results[url] = { status: res.status, length: text.length, snippet: text.substring(0, 1000) };
        } catch (e) {
          results[url] = { error: e.message };
        }
      }
      return results;
    });

    for (const [url, info] of Object.entries(moduleApis)) {
      if (info.status === 200 && info.length > 100 && !info.snippet.includes('未知的命令')) {
        log(`✓ ${url.substring(0, 100)}`);
        log(`  Length: ${info.length}, Preview: ${info.snippet.substring(0, 500)}`);
      }
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'module_apis.json'), JSON.stringify(moduleApis, null, 2));

    // Also try the Task.ashx?method=GetTaskInfo with actual TaskIDs from the WorkList
    log('\n=== Getting task details via Task.ashx?method=GetTaskInfo ===');
    
    // First get WorkList to get TaskIDs
    const workListData = await page.evaluate(async () => {
      const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      return await res.text();
    });
    
    let taskIds = [];
    try {
      const parsed = JSON.parse(workListData.replace(/new Date\([^)]+\)/g, '""'));
      taskIds = (parsed.children || []).map(c => ({ TaskID: c.TaskID, StepID: c.StepID, SerialNum: c.SerialNum, ProcessName: c.ProcessName, Description: c.Description, NodeName: c.NodeName }));
    } catch (e) {
      log(`Failed to parse WorkList: ${e.message}`);
    }
    
    log(`Found ${taskIds.length} tasks in WorkList`);
    
    // Get task info for each task
    for (let i = 0; i < Math.min(taskIds.length, 3); i++) {
      const task = taskIds[i];
      log(`\nTask ${i + 1}: ${task.ProcessName} - ${task.Description} (TaskID: ${task.TaskID})`);
      
      const taskInfo = await page.evaluate(async (taskID) => {
        const res = await fetch('/YZSoft.Services.REST/BPM/Task.ashx?method=GetTaskInfo&TaskID=' + taskID + '&_dc=' + Date.now(), { credentials: 'include' });
        return await res.text();
      }, task.TaskID);
      
      log(`Task info: ${taskInfo.substring(0, 2000)}`);
      fs.writeFileSync(path.join(OUTPUT_DIR, `taskinfo_${task.TaskID}.json`), taskInfo);
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
