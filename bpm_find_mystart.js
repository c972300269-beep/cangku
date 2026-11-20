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

    // Get full module tree
    log('Getting full module tree...');
    const moduleTree = await page.evaluate(async () => {
      const res = await fetch('/BPM2018/Modules/BPM.ashx?method=GetModuleTree&_dc=' + Date.now(), { credentials: 'include' });
      return await res.text();
    });
    
    log(`Full module tree:\n${moduleTree}`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'bpm_full_module_tree.json'), moduleTree);

    // Parse and analyze
    const modules = JSON.parse(moduleTree);
    
    log('\n=== Module Tree Analysis ===');
    function printTree(items, depth = 0) {
      if (!items) return;
      for (const item of items) {
        const indent = '  '.repeat(depth);
        log(`${indent}- ${item.text || item.title || '(unnamed)'} | id=${item.id || ''} | xclass=${item.xclass || ''} | dataURL=${item.dataURL || ''}`);
        if (item.children) printTree(item.children, depth + 1);
        if (item.items) printTree(item.items, depth + 1);
      }
    }
    printTree(modules);

    // Find "我发起的流程" related modules
    log('\n=== Looking for "我发起的流程" ===');
    function findModules(items, keywords) {
      if (!items) return [];
      let results = [];
      for (const item of items) {
        const text = item.text || item.title || '';
        if (keywords.some(kw => text.includes(kw))) {
          results.push(item);
        }
        if (item.children) results = results.concat(findModules(item.children, keywords));
        if (item.items) results = results.concat(findModules(item.items, keywords));
      }
      return results;
    }

    const myStartModules = findModules(modules, ['我发起', '发起的流程', '我的流程', '我创建', 'MyStart', '我的申请']);
    log(`Found ${myStartModules.length} matching modules:`);
    myStartModules.forEach(m => log(`  ${JSON.stringify(m)}`));

    // For each module with xclass, look up the JS file to find API endpoints
    log('\n=== Looking up xclass JS files for API endpoints ===');
    function collectXclasses(items) {
      if (!items) return [];
      let results = [];
      for (const item of items) {
        if (item.xclass) results.push({ text: item.text, xclass: item.xclass, id: item.id });
        if (item.children) results = results.concat(collectXclasses(item.children));
        if (item.items) results = results.concat(collectXclasses(item.items));
      }
      return results;
    }

    const xclasses = collectXclasses(modules);
    log(`Found ${xclasses.length} xclass modules:`);
    xclasses.forEach(x => log(`  ${x.text} -> ${x.xclass}`));

    // For "我发起的流程" related xclasses, fetch the JS file and find API endpoints
    for (const x of xclasses) {
      // Convert xclass to file path: YZSoft.BPM.MyStart.Panel -> YZSoft/BPM/MyStart/Panel.js
      const filePath = x.xclass.replace(/\./g, '/') + '.js';
      const url = `/BPM2018/${filePath}?_dc=5.70v.181`;
      
      log(`\nFetching JS: ${x.text} -> ${url}`);
      const jsContent = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, { credentials: 'include' });
          return await res.text();
        } catch (e) {
          // Try YZSoft path
          try {
            const res2 = await fetch('/' + url.replace('/BPM2018/', ''), { credentials: 'include' });
            return await res2.text();
          } catch (e2) {
            return e2.message;
          }
        }
      }, url);
      
      // Find .ashx endpoints in the JS file
      const ashxMatches = jsContent.match(/['"][^'"]*\.ashx[^'"]*['"]/g) || [];
      const methodMatches = jsContent.match(/method[':]*\s*['"][^'"]+['"]/g) || [];
      
      if (ashxMatches.length > 0 || methodMatches.length > 0) {
        log(`  .ashx endpoints: ${[...new Set(ashxMatches)].join(', ')}`);
        log(`  methods: ${[...new Set(methodMatches)].join(', ')}`);
      }
      
      // Also search for "GetWorkList" or similar patterns
      const apiPatterns = jsContent.match(/(?:url|api|data|proxy|ajax|fetch|request)[^;]{0,200}(?:ashx|Service|api|handler)[^;]*/gi) || [];
      if (apiPatterns.length > 0) {
        log(`  API patterns: ${apiPatterns.slice(0, 5).join('\n  ')}`);
      }
    }

    // Step 3: Now try to find the correct API for "我发起的流程" 
    // Based on the module tree, the "我发起的流程" module likely uses a specific xclass
    // Let me also try calling BPM.ashx with method=GetMyStart or similar
    log('\n=== Trying BPM.ashx with various methods ===');
    const bpmMethodResults = await page.evaluate(async () => {
      const results = {};
      const methods = ['GetMyStart', 'GetMyStartList', 'GetMyProcess', 'GetStartList', 
                       'GetMyInitiate', 'GetMyApply', 'GetStart', 'GetProcessList',
                       'GetWorkList', 'GetHistory', 'GetProcessed', 'GetMyProcessed',
                       'GetRunningProcess', 'GetMyRunningProcess'];
      for (const method of methods) {
        try {
          const res = await fetch('/BPM2018/Modules/BPM.ashx?method=' + method + '&start=0&limit=50&_dc=' + Date.now(), { credentials: 'include' });
          const text = await res.text();
          results[method] = { status: res.status, length: text.length, snippet: text.substring(0, 1000) };
        } catch (e) {
          results[method] = { error: e.message };
        }
      }
      return results;
    });

    for (const [method, info] of Object.entries(bpmMethodResults)) {
      if (info.status === 200 && info.length > 50 && !info.snippet.includes('未知的命令')) {
        log(`✓✓✓ BPM.ashx?method=${method}: length=${info.length}`);
        log(`  ${info.snippet.substring(0, 800)}`);
      }
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'bpm_method_results.json'), JSON.stringify(bpmMethodResults, null, 2));

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
