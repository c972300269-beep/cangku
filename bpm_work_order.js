const { chromium } = require('playwright');
const fs = require('fs');

const BPM_URL = 'http://bpm.timesgroup.cn';

function log(msg) { console.log(msg); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(() => {}); } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

(async () => {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();

    log('登录 BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    // Get module tree
    log('\n=== 获取模块树 ===');
    const moduleTree = await page.evaluate(async () => {
      const res = await fetch('/BPM2018/Modules/BPM.ashx?method=GetModuleTree&_dc=' + Date.now(), { credentials: 'include' });
      return await res.text();
    });

    // Find work order related modules
    function findWorkOrderModules(items, depth = 0) {
      if (!items) return [];
      let results = [];
      for (const item of items) {
        const name = (item.text || item.name || item.title || '');
        const durl = item.dataURL || '';
        if (name.includes('工单') || name.includes('补票') || name.includes('ticket') || name.includes('服务') || name.includes('任务')) {
          results.push({ name, depth, dataURL: durl, id: item.id, text: item.text, items: item.children ? item.children.length : 0 });
        }
        if (item.children) {
          results = results.concat(findWorkOrderModules(item.children, depth + 1));
        }
        if (item.items) {
          results = results.concat(findWorkOrderModules(item.items, depth + 1));
        }
      }
      return results;
    }

    // Parse
    try {
      const clean = moduleTree.replace(/new Date\([^)]+\)/g, 'null');
      const data = JSON.parse(clean);
      const arr = Array.isArray(data) ? data : [data];
      
      // Print ALL top-level modules
      log('顶层模块:');
      arr.forEach(m => {
        const name = m.text || m.name || m.title || '?';
        log(`  - ${name} [dataURL=${m.dataURL || ''}] [children=${(m.children||[]).length}]`);
        if (m.children) {
          m.children.forEach(c => {
            log(`    - ${c.text || c.name || c.title || '?'} [dataURL=${c.dataURL || ''}]`);
          });
        }
      });

      // Find work order modules
      const woModules = findWorkOrderModules(arr);
      log(`\n=== 工单相关模块 (找到 ${woModules.length} 个) ===`);
      woModules.forEach(m => {
        log(`  ${'  '.repeat(m.depth)}${m.name} -> ${m.dataURL}`);
      });

    } catch (e) {
      log(`解析失败: ${e.message}`);
    }

    // Also try to access common work order pages directly
    log('\n=== 尝试直接访问工单页面 ===');
    const woUrls = [
      '/YZSoft/Forms/WorkOrderList.aspx',
      '/BPM2018/WorkOrder/List.aspx',
      '/BPM2018/Ticket/List.aspx',
      '/BPM2018/Service/List.aspx',
    ];
    
    for (const url of woUrls) {
      try {
        const resp = await page.goto(BPM_URL + url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        log(`  ${url} -> ${resp.status()}`);
        const bodyText = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 300) : '');
        log(`    Page: ${bodyText}`);
      } catch (e) {
        log(`  ${url} -> error: ${e.message}`);
      }
    }

  } finally {
    await safeClose(browser);
  }
})().catch(e => console.error(e));
