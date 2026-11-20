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

function decodeUnicode(str) {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (m, p) => String.fromCharCode(parseInt(p, 16)));
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
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
    log('登录中...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    // 获取"我发起的流程" → "审批中"数据
    log('获取"我发起的流程"→"审批中"数据...');
    const myApplyingData = await page.evaluate(async () => {
      const params = new URLSearchParams({
        method: 'GetHistoryTasks',
        HistoryTaskType: 'MyRequest',
        ThisTaskState: 'Running',
        byYear: '0',  // 获取所有年份
        start: '0',
        limit: '500',
        _dc: Date.now().toString()
      });
      const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString(), { credentials: 'include' });
      return await res.text();
    });

    log(`\n=== "我发起的流程"→"审批中" 数据 ===`);
    log(`数据长度: ${myApplyingData.length}`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'my_applying_requests.json'), myApplyingData);

    // 解析数据 - 需要处理 new Date() 格式
    const cleanData = myApplyingData.replace(/new Date\(([^)]+)\)/g, (match, args) => {
      // Convert new Date(2026,5,22,16,48,20) to a string representation
      const parts = args.split(',').map(p => parseInt(p.trim()));
      if (parts.length >= 3) {
        const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
        return JSON.stringify(d.toISOString());
      }
      return 'null';
    });

    let parsedData;
    try {
      parsedData = JSON.parse(cleanData);
    } catch (e) {
      log(`解析失败: ${e.message}`);
      log(`原始数据: ${myApplyingData.substring(0, 3000)}`);
      return;
    }

    log(`\n总条数: ${parsedData.total || 0}`);
    
    if (parsedData.children && parsedData.children.length > 0) {
      log(`\n=== 流程列表 ===`);
      
      parsedData.children.forEach((item, i) => {
        log(`\n--- 流程 ${i + 1} ---`);
        log(`  流程名称: ${item.ProcessName || ''}`);
        log(`  流水号: ${item.SerialNum || ''}`);
        log(`  描述: ${item.Description || ''}`);
        log(`  发起人: ${item.OwnerDisplayName || ''} (${item.OwnerAccount || ''})`);
        log(`  创建时间: ${item.CreateAt || ''}`);
        log(`  当前节点: ${item.NodeName || ''}`);
        log(`  当前处理人: ${item.RecipientDisplayName || ''} (${item.RecipientAccount || ''})`);
        log(`  状态: ${JSON.stringify(item.State || '')}`);
        
        // Print all fields for the first item
        if (i === 0) {
          log(`\n  === 所有字段 ===`);
          for (const key in item) {
            const val = item[key];
            if (typeof val !== 'object' || val === null) {
              log(`  ${key}: ${val}`);
            } else {
              log(`  ${key}: ${JSON.stringify(val)}`);
            }
          }
        }
      });
    } else {
      log('没有找到"审批中"的流程');
      log(`原始数据: ${myApplyingData.substring(0, 2000)}`);
    }

    // 输出完整数据用于分析
    log('\n=== 完整JSON数据 ===');
    log(JSON.stringify(parsedData, null, 2).substring(0, 5000));

  } catch (error) {
    log(`错误: ${error.message}`);
    log(error.stack);
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
