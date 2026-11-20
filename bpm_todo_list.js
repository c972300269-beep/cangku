const { chromium } = require('playwright');

const BPM_URL = 'http://bpm.timesgroup.cn';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function processOutput(rawData) {
  log(`数据长度: ${rawData.length}`);

  const cleanData = rawData.replace(/new Date\(([^)]+)\)/g, (match, args) => {
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
    log(`原始数据前1000字: ${rawData.substring(0, 1000)}`);
    return false;
  }

  log(`\n=== 待办任务 ===`);
  log(`总条数: ${parsedData.total || 0}`);

  if (parsedData.children && parsedData.children.length > 0) {
    parsedData.children.forEach((item, i) => {
      log(`\n--- 待办 ${i + 1} ---`);
      log(`  流程名称: ${item.ProcessName || ''}`);
      log(`  流水号: ${item.SerialNum || ''}`);
      log(`  描述: ${(item.Description || '').replace(/<br\/>/g, ' ')}`);
      log(`  发起人: ${item.OwnerDisplayName || ''} (${item.OwnerAccount || ''})`);
      log(`  创建时间: ${item.CreateAt || ''}`);
      log(`  当前节点: ${item.StepName || item.NodeName || ''}`);
      log(`  到达时间: ${item.ReceiveAt || ''}`);
    });
  } else {
    log('\n🎉 没有待办任务！');
  }
  return true;
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    log('登录中...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    log('获取待办任务(GetWorkList)...');
    const workData = await page.evaluate(async () => {
      try {
        const params = new URLSearchParams({
          method: 'GetWorkList',
          start: '0',
          limit: '500',
          _dc: Date.now().toString()
        });
        const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString(), { 
          credentials: 'include',
          signal: AbortSignal.timeout(15000)
        });
        return await res.text();
      } catch (e) {
        return 'FETCH_ERROR:' + e.message;
      }
    });

    if (workData.startsWith('FETCH_ERROR:')) {
      log(`请求失败: ${workData}`);
      await browser.close();
      return;
    }

    processOutput(workData);

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
