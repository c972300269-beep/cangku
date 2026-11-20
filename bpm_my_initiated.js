const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function safeScreenshot(page, name) {
  try {
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false, timeout: 5000 });
  } catch (e) {}
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

  // Intercept all requests/responses
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('.ashx') || url.includes('.aspx') || url.includes('Service') || url.includes('Handler') || url.includes('api')) {
      try {
        const status = response.status();
        let body = '';
        try { body = await response.text(); } catch (e) {}
        apiCalls.push({ url, status, bodyLength: body.length, body: body.substring(0, 3000) });
      } catch (e) {}
    }
  });

  try {
    log('Navigating to BPM portal...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for ExtJS to load
    log('Waiting for ExtJS...');
    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      const hasExt = await page.evaluate(() => typeof Ext !== 'undefined').catch(() => false);
      log(`  Attempt ${i + 1}: ExtJS loaded = ${hasExt}`);
      if (hasExt) {
        await sleep(5000);
        break;
      }
    }

    log(`Current URL: ${page.url()}`);

    // Get full HTML
    const html = await page.content();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'portal_full.html'), html);
    log(`HTML length: ${html.length}`);

    // Get DOM structure info
    const domInfo = await page.evaluate(() => {
      const info = {
        bodyInnerHTML: document.body ? document.body.innerHTML.substring(0, 5000) : '',
        bodyInnerText: document.body ? document.body.innerText.substring(0, 2000) : '',
        iframes: [],
        extComponents: [],
        inputs: [],
        links: []
      };

      // Get iframes
      document.querySelectorAll('iframe').forEach(f => {
        info.iframes.push({ src: f.src, id: f.id, name: f.name, className: f.className });
      });

      // Get ExtJS components safely
      if (typeof Ext !== 'undefined') {
        try {
          if (Ext.ComponentMgr) {
            const all = Ext.ComponentMgr.all;
            if (all) {
              // It might be a MixedCollection
              const items = all.items || all.map || [];
              const keys = all.keys || [];
              for (let i = 0; i < Math.min(items.length, 100); i++) {
                const cmp = items[i];
                if (cmp) {
                  const cmpInfo = {
                    xtype: cmp.xtype || '',
                    text: cmp.text || '',
                    title: cmp.title || '',
                    id: cmp.id || ''
                  };
                  if (cmpInfo.text || cmpInfo.title) {
                    info.extComponents.push(cmpInfo);
                  }
                }
              }
              info.extComponentCount = items.length;
            }
          }
        } catch (e) {
          info.extError = e.message;
        }
      }

      // Get inputs
      document.querySelectorAll('input').forEach(inp => {
        info.inputs.push({ type: inp.type, name: inp.name, id: inp.id, placeholder: inp.placeholder, value: inp.value ? '(has value)' : '' });
      });

      // Get links
      document.querySelectorAll('a').forEach(a => {
        if (a.textContent.trim().length > 0 && a.textContent.trim().length < 50) {
          info.links.push({ text: a.textContent.trim(), href: a.href });
        }
      });

      return info;
    });

    log(`DOM Info:`);
    log(`  HTML length: ${html.length}`);
    log(`  Body innerHTML length: ${domInfo.bodyInnerHTML.length}`);
    log(`  Body innerText: "${domInfo.bodyInnerText.substring(0, 200)}"`);
    log(`  Iframes: ${JSON.stringify(domInfo.iframes)}`);
    log(`  ExtJS components: ${domInfo.extComponents.length} (total: ${domInfo.extComponentCount || 0})`);
    log(`  Inputs: ${JSON.stringify(domInfo.inputs)}`);
    log(`  Links: ${JSON.stringify(domInfo.links.slice(0, 20))}`);
    if (domInfo.extError) log(`  ExtJS error: ${domInfo.extError}`);
    
    fs.writeFileSync(path.join(OUTPUT_DIR, 'dom_info.json'), JSON.stringify(domInfo, null, 2));

    // Check if there's a login page being shown via ExtJS
    if (domInfo.bodyInnerText.includes('登录') || domInfo.bodyInnerText.includes('账号')) {
      log('Login form detected via ExtJS, trying to login...');
      
      // Try to fill in credentials
      const inputs = await page.$$('input');
      for (const inp of inputs) {
        const type = await inp.getAttribute('type');
        const name = await inp.getAttribute('name');
        const placeholder = await inp.getAttribute('placeholder');
        log(`  Input: type=${type}, name=${name}, placeholder=${placeholder}`);
        
        if (type === 'password' || name === '_txtPwd' || placeholder === '密码') {
          await inp.fill('__REDACTED_SECRET__');
        } else if (type === 'text' || name === '_txtUid' || placeholder === '账号') {
          await inp.fill('chenjialin3');
        }
      }
      
      // Try to click login button
      const buttons = await page.$$('button, .yz-btn, [id*="btnLogin"], a:has-text("登录"), a:has-text("登 录")');
      for (const btn of buttons) {
        const text = await btn.textContent();
        log(`  Button: ${text}`);
        if (text.includes('登录') || text.includes('登 录')) {
          await btn.click();
          await sleep(10000);
          break;
        }
      }
    }

    // Wait for more AJAX calls to complete
    log('\nWaiting for AJAX calls...');
    await sleep(10000);

    // Get frames
    const frames = page.frames();
    log(`\nFrames: ${frames.length}`);
    for (const frame of frames) {
      log(`  Frame: ${frame.url()}`);
      try {
        const frameText = await frame.evaluate(() => document.body ? document.body.innerText.substring(0, 500) : '');
        if (frameText) log(`  Frame text: ${frameText.substring(0, 200)}`);
      } catch (e) {}
    }

    // Try API calls
    log('\n=== Trying API endpoints ===');
    const apiResults = await page.evaluate(async () => {
      const results = {};
      const endpoints = [
        '/YZSoft/Services/V2/BPM/MyStartList.ashx',
        '/YZSoft/Services/V2/BPM/MyApplyList.ashx',
        '/YZSoft/Services/V2/BPM/MyInitiatedList.ashx',
        '/YZSoft/Services/V2/BPM/MyProcessList.ashx',
        '/YZSoft/Services/V2/BPM/MyTaskList.ashx',
        '/YZSoft/Services/V2/BPM/TaskList.ashx',
        '/YZSoft/Services/V2/BPM/ProcessList.ashx',
        '/YZSoft/Services/V2/BPM/Worklist.ashx',
        '/YZSoft/Services/BPM/MyStartList.ashx',
        '/YZSoft/Services/BPM/MyProcessList.ashx',
        '/BPM2018/BPM/Portal/Handler/MyStart.ashx',
        '/BPM2018/BPM/Portal/Handler/MyTask.ashx',
        '/BPM2018/BPM/Portal/Handler/Process.ashx',
        '/BPM2018/Handler/MyStart.ashx',
      ];
      
      for (const ep of endpoints) {
        try {
          const params = new URLSearchParams({
            start: '0',
            limit: '50',
            _dc: Date.now().toString()
          });
          const res = await fetch(ep + '?' + params.toString(), { credentials: 'include' });
          const text = await res.text();
          results[ep] = { status: res.status, length: text.length, snippet: text.substring(0, 1000) };
        } catch (e) {
          results[ep] = { error: e.message };
        }
      }
      return results;
    });

    for (const [ep, info] of Object.entries(apiResults)) {
      if (info.status === 200 && info.length > 20) {
        log(`✓ ${ep}: status=${info.status}, length=${info.length}`);
        log(`  ${info.snippet.substring(0, 500)}`);
      } else if (info.error) {
        log(`✗ ${ep}: ${info.error}`);
      } else {
        log(`  ${ep}: status=${info.status}, length=${info.length || 0}`);
      }
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'api_results.json'), JSON.stringify(apiResults, null, 2));

    // For successful endpoints, fetch with different parameters
    for (const [ep, info] of Object.entries(apiResults)) {
      if (info.status === 200 && info.length > 50) {
        log(`\nFetching full data from: ${ep}`);
        
        // Try different filter parameters
        const paramSets = [
          { start: '0', limit: '500', _dc: Date.now().toString() },
          { start: '0', limit: '500', filter: JSON.stringify({status: 'running'}), _dc: Date.now().toString() },
          { start: '0', limit: '500', status: 'running', _dc: Date.now().toString() },
          { start: '0', limit: '500', type: 'myStart', _dc: Date.now().toString() },
        ];
        
        for (let pi = 0; pi < paramSets.length; pi++) {
          const fullData = await page.evaluate(async (endpoint, params) => {
            const searchParams = new URLSearchParams(params);
            const res = await fetch(endpoint + '?' + searchParams.toString(), { credentials: 'include' });
            return await res.text();
          }, ep, paramSets[pi]);
          
          if (fullData.length > 50) {
            const filename = `${ep.replace(/[^a-zA-Z0-9]/g, '_')}_params${pi}.json`;
            fs.writeFileSync(path.join(OUTPUT_DIR, `data_${filename}`), fullData);
            log(`  Params ${pi}: length=${fullData.length}, preview: ${fullData.substring(0, 500)}`);
          }
        }
      }
    }

    // Print intercepted API calls
    log('\n=== Intercepted API Calls ===');
    log(`Total: ${apiCalls.length}`);
    apiCalls.forEach((call, i) => {
      log(`  ${i + 1}. [${call.status}] ${call.url}`);
      log(`     Length: ${call.bodyLength}`);
      if (call.bodyLength > 0 && call.bodyLength < 5000) {
        log(`     Body: ${call.body.substring(0, 500)}`);
      }
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'intercepted_api_calls.json'), JSON.stringify(apiCalls, null, 2));

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
