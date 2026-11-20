const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanJson(text) {
  return text.replace(/new Date\(([^)]+)\)/g, (match, args) => {
    const parts = args.split(',').map(p => parseInt(p.trim()));
    if (parts.length >= 3) {
      const d = new Date(parts[0], parts[1], parts[2], parts[3]||0, parts[4]||0, parts[5]||0);
      return JSON.stringify(d.toISOString());
    }
    return 'null';
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--auth-server-allowlist=bpm.timesgroup.cn',
      '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    log('登录BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);
    log('登录完成');

    // 分页获取所有 Approved 流程
    const allStamps = [];
    const allItems = [];
    let start = 0;
    const limit = 500;
    
    while (true) {
      const data = await page.evaluate(async (args) => {
        const { s, l } = args;
        const params = new URLSearchParams({
          method: 'GetHistoryTasks',
          HistoryTaskType: 'MyRequest',
          ThisTaskState: 'Approved',
          byYear: '0',
          start: s.toString(),
          limit: l.toString(),
          _dc: Date.now().toString()
        });
        const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString(), { credentials: 'include' });
        return await res.text();
      }, { s: start, l: limit });

      const clean = cleanJson(data);
      const parsed = JSON.parse(clean);
      const children = parsed.children || [];
      
      log(`分页 ${start}-${start+children.length}, 共 ${parsed.total} 条`);
      
      if (children.length === 0) break;

      for (const item of children) {
        allItems.push(item);
        const str = JSON.stringify(item);
        if (str.includes('盖章') || str.includes('印章') || str.includes('用印')) {
          allStamps.push(item);
        }
      }

      // 如果已全部取完则退出
      if (start + children.length >= parsed.total) break;
      start += limit;
    }

    log(`\n=== 盖章/用印流程: ${allStamps.length}条 ===\n`);
    
    // 按时间倒序
    allStamps.sort((a, b) => new Date(b.CreateAt) - new Date(a.CreateAt));
    
    // 表格输出
    console.log('| # | 流水号 | 流程 | 描述 | 发起时间 | 状态 |');
    console.log('|---|--------|------|------|----------|------|');
    allStamps.forEach((s, i) => {
      const stateInfo = s.State;
      const stepName = stateInfo && stateInfo.children && stateInfo.children[0] 
        ? stateInfo.children[0].StepName : (stateInfo ? stateInfo.State : '?');
      console.log(`| ${i+1} | ${s.SerialNum} | ${s.ProcessName} | ${(s.Description||'').substring(0, 50)} | ${(s.CreateAt||'').substring(0,10)} | ${stepName} |`);
    });

    console.log(`\n总计 ${allStamps.length} 条盖章流程`);

  } catch (error) {
    log(`错误: ${error.message}`);
    log(error.stack);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
