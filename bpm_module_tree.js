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

    // Step 1: Get the BPM module tree from Modules/BPM.ashx
    log('\n=== Getting BPM module tree ===');
    const bpmModule = await page.evaluate(async () => {
      const res = await fetch('/BPM2018/Modules/BPM.ashx?_dc=' + Date.now(), { credentials: 'include' });
      return await res.text();
    });
    log(`BPM module response: ${bpmModule.substring(0, 5000)}`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'bpm_module_tree.json'), bpmModule);

    // Try with method parameter
    const bpmModule2 = await page.evaluate(async () => {
      const res = await fetch('/BPM2018/Modules/BPM.ashx?method=GetTree&_dc=' + Date.now(), { credentials: 'include' });
      return await res.text();
    });
    log(`BPM module (method=GetTree): ${bpmModule2.substring(0, 5000)}`);

    // Try other methods on BPM.ashx
    const bpmMethods = await page.evaluate(async () => {
      const results = {};
      const methods = ['GetTree', 'GetModuleTree', 'GetNavigation', 'GetMenu', 'GetList', 'GetNodes', '', 'GetConfig', 'GetData'];
      for (const method of methods) {
        try {
          let url = '/BPM2018/Modules/BPM.ashx?_dc=' + Date.now();
          if (method) url += '&method=' + method;
          const res = await fetch(url, { credentials: 'include' });
          const text = await res.text();
          results[method || 'nomethod'] = { status: res.status, length: text.length, snippet: text.substring(0, 2000) };
        } catch (e) {
          results[method || 'nomethod'] = { error: e.message };
        }
      }
      return results;
    });

    for (const [method, info] of Object.entries(bpmMethods)) {
      if (info.status === 200 && info.length > 50) {
        log(`\n✓ BPM.ashx method=${method}: status=${info.status}, length=${info.length}`);
        log(`  ${info.snippet.substring(0, 1500)}`);
      }
    }

    // Step 2: Parse the module tree and find "我发起的流程"
    log('\n=== Parsing module tree ===');
    let moduleData;
    try {
      // The response might have Date objects, replace them
      const cleanResponse = bpmModule.replace(/new Date\([^)]+\)/g, 'null');
      moduleData = JSON.parse(cleanResponse);
    } catch (e) {
      log(`Failed to parse: ${e.message}`);
      log(`Raw response: ${bpmModule.substring(0, 2000)}`);
      moduleData = null;
    }

    if (moduleData) {
      // Print the full module tree
      log(`Module tree: ${JSON.stringify(moduleData, null, 2).substring(0, 5000)}`);

      // Find "我发起的流程" in the tree
      function searchTree(items, depth = 0) {
        if (!items) return [];
        let results = [];
        for (const item of items) {
          log(`${'  '.repeat(depth)}- ${item.text || item.title || item.name || '(no name)'} [id=${item.id || ''}] [dataURL=${item.dataURL || ''}]`);
          if (item.text && (item.text.includes('我发起') || item.text.includes('发起的流程') || item.text.includes('我的流程'))) {
            results.push(item);
          }
          if (item.title && (item.title.includes('我发起') || item.title.includes('发起的流程') || item.title.includes('我的流程'))) {
            results.push(item);
          }
          if (item.children) {
            results = results.concat(searchTree(item.children, depth + 1));
          }
          if (item.items) {
            results = results.concat(searchTree(item.items, depth + 1));
          }
        }
        return results;
      }

      const found = searchTree(Array.isArray(moduleData) ? moduleData : [moduleData]);
      if (found.length > 0) {
        log(`\n✓ Found "我发起的流程" modules!`);
        found.forEach(m => log(`  ${JSON.stringify(m, null, 2)}`));
      }

      // Step 3: For each module with a dataURL, try to fetch it
      log('\n=== Fetching module data URLs ===');
      function collectDataUrls(items) {
        if (!items) return [];
        let urls = [];
        for (const item of items) {
          if (item.dataURL) {
            urls.push({ text: item.text || item.title || item.name, dataURL: item.dataURL, id: item.id });
          }
          if (item.children) urls = urls.concat(collectDataUrls(item.children));
          if (item.items) urls = urls.concat(collectDataUrls(item.items));
        }
        return urls;
      }

      const dataUrls = collectDataUrls(Array.isArray(moduleData) ? moduleData : [moduleData]);
      log(`Found ${dataUrls.length} data URLs`);
      
      for (const du of dataUrls) {
        log(`\nFetching: ${du.text} -> ${du.dataURL}`);
        const data = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url, { credentials: 'include' });
            return await res.text();
          } catch (e) {
            return e.message;
          }
        }, du.dataURL);
        
        log(`Response: ${data.substring(0, 3000)}`);
        const safeName = (du.text || du.id || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
        fs.writeFileSync(path.join(OUTPUT_DIR, `module_${safeName}.json`), data);
        
        // If this module has children with dataURLs, fetch those too
        try {
          const cleanData = data.replace(/new Date\([^)]+\)/g, 'null');
          const parsed = JSON.parse(cleanData);
          const subUrls = collectDataUrls(Array.isArray(parsed) ? parsed : [parsed]);
          for (const su of subUrls) {
            log(`\n  Sub-fetching: ${su.text} -> ${su.dataURL}`);
            const subData = await page.evaluate(async (url) => {
              try {
                const res = await fetch(url, { credentials: 'include' });
                return await res.text();
              } catch (e) {
                return e.message;
              }
            }, su.dataURL);
            log(`  Response: ${subData.substring(0, 2000)}`);
            const subSafeName = (su.text || su.id || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
            fs.writeFileSync(path.join(OUTPUT_DIR, `module_${subSafeName}.json`), subData);
          }
        } catch (e) {}
      }
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
