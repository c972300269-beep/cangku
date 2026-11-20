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
    // Step 1: Login via NT auth (automatic)
    log('Step 1: Navigating to BPM portal for NT auth...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(10000); // Wait for NT auth + ExtJS load

    // Verify login
    const userInfo = await page.evaluate(async () => {
      try {
        const res = await fetch('/Default.aspx', { credentials: 'include' });
        return await res.text();
      } catch (e) {
        return e.message;
      }
    });
    log(`User info response: ${userInfo.substring(0, 500)}`);

    if (!userInfo.includes('chenjialin3')) {
      log('NT auth may have failed, trying direct login...');
      // Try manual login
      await page.goto('http://bpm.timesgroup.cn/YZSoft/login/2018/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
      
      // Force show login panel and fill in
      await page.evaluate(() => {
        const pnl = document.getElementById('_pnlLogin');
        if (pnl) pnl.style.display = 'block';
        const errmsg = document.getElementById('errmsg');
        if (errmsg) errmsg.style.display = 'none';
      });
      await sleep(1000);
      
      const uid = await page.$('#_txtUid');
      const pwd = await page.$('#_txtPwd');
      if (uid && pwd) {
        await uid.fill('chenjialin3');
        await pwd.fill('__REDACTED_SECRET__');
        await sleep(500);
        await page.evaluate(() => {
          if (typeof $ !== 'undefined') $('#_btnLogin').click();
        });
        await sleep(10000);
      }
    }

    // Step 2: Get module tree to find "我发起的流程"
    log('\nStep 2: Getting module tree...');
    const moduleTree = await page.evaluate(async () => {
      try {
        const res = await fetch('/BPM2018/Apps/Apps.ashx?method=GetModuleTree&_dc=' + Date.now(), { credentials: 'include' });
        return await res.text();
      } catch (e) {
        return e.message;
      }
    });
    log(`Module tree: ${moduleTree.substring(0, 3000)}`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'module_tree.json'), moduleTree);

    // Step 3: Try various API endpoints and methods for "我发起的流程"
    log('\nStep 3: Trying API endpoints for "我发起的流程"...');

    const apiTests = await page.evaluate(async () => {
      const results = {};
      
      // Try TaskList.ashx with different methods
      const taskListMethods = ['GetWorkList', 'GetMyStart', 'GetMyStartList', 'GetMyProcess', 'GetMyInitiate', 'GetMyApply', 'GetShareTask', 'GetReturnList', 'GetAll'];
      
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
          results[`TaskList_${method}`] = { status: res.status, length: text.length, snippet: text.substring(0, 1000) };
        } catch (e) {
          results[`TaskList_${method}`] = { error: e.message };
        }
      }
      
      // Try other endpoints
      const otherEndpoints = [
        '/YZSoft.Services.REST/BPM/ProcessList.ashx',
        '/YZSoft.Services.REST/BPM/MyStart.ashx',
        '/YZSoft.Services.REST/BPM/MyProcess.ashx',
        '/YZSoft.Services.REST/BPM/Process.ashx',
        '/YZSoft.Services.REST/BPM/Task.ashx',
        '/YZSoft.Services.REST/BPM/Worklist.ashx',
        '/YZSoft.Services.REST/BPM/MyTask.ashx',
        '/YZSoft.Services.REST/BPM/MyStartList.ashx',
      ];
      
      for (const ep of otherEndpoints) {
        for (const method of ['GetMyStart', 'GetList', 'GetMyStartList', 'GetMyProcess', '']) {
          try {
            const params = new URLSearchParams({
              start: '0',
              limit: '50',
              _dc: Date.now().toString()
            });
            if (method) params.set('method', method);
            const res = await fetch(ep + '?' + params.toString(), { credentials: 'include' });
            const text = await res.text();
            const key = `${ep}_${method || 'nomethod'}`;
            if (!results[key] || (results[key].status !== 200 && res.status === 200)) {
              results[key] = { status: res.status, length: text.length, snippet: text.substring(0, 1000) };
            }
          } catch (e) {
            // Skip
          }
        }
      }
      
      return results;
    });

    // Print results
    for (const [key, info] of Object.entries(apiTests)) {
      if (info.status === 200 && info.length > 20) {
        log(`✓ ${key}: status=${info.status}, length=${info.length}`);
        log(`  ${info.snippet.substring(0, 500)}`);
      } else if (info.error) {
        log(`✗ ${key}: ${info.error}`);
      } else {
        log(`  ${key}: status=${info.status}, length=${info.length || 0}`);
      }
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'api_tests.json'), JSON.stringify(apiTests, null, 2));

    // Step 4: For any successful endpoint with data, fetch full data
    log('\nStep 4: Fetching full data from successful endpoints...');
    
    for (const [key, info] of Object.entries(apiTests)) {
      if (info.status === 200 && info.length > 50 && !info.snippet.includes('access denied')) {
        log(`Fetching full data from: ${key}`);
        
        // Parse the key to get endpoint and method
        const parts = key.split('_');
        const method = parts.slice(1).join('_');
        
        const fullData = await page.evaluate(async (method) => {
          const params = new URLSearchParams({
            start: '0',
            limit: '500',
            _dc: Date.now().toString()
          });
          if (method && method !== 'nomethod') params.set('method', method);
          
          // Determine endpoint
          let endpoint = '/YZSoft.Services.REST/BPM/TaskList.ashx';
          if (method === 'nomethod') {
            // Try the original endpoint
          }
          
          const res = await fetch(endpoint + '?' + params.toString(), { credentials: 'include' });
          return await res.text();
        }, method);
        
        fs.writeFileSync(path.join(OUTPUT_DIR, `fulldata_${key}.json`), fullData);
        log(`Data length: ${fullData.length}`);
      }
    }

    // Step 5: Also try to get the Main.ashx data which might contain navigation
    log('\nStep 5: Getting Main.ashx data...');
    const mainData = await page.evaluate(async () => {
      try {
        const res = await fetch('/BPM2018/BPM/Portal/Main.ashx?_dc=' + Date.now(), { credentials: 'include' });
        return await res.text();
      } catch (e) {
        return e.message;
      }
    });
    log(`Main.ashx: ${mainData.substring(0, 2000)}`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'main_ashx.json'), mainData);

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
