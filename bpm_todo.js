const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

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
    locale: 'zh-CN', ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    log('登录BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 8000));

    // 获取待办任务列表
    log('获取待办任务...');
    const worklistData = await page.evaluate(async () => {
      const params = new URLSearchParams({
        method: 'GetWorkList',
        _dc: Date.now().toString()
      });
      const res = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString(), { credentials: 'include' });
      return await res.text();
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, 'todo_worklist.json'), worklistData);

    // Parse
    const cleanData = worklistData.replace(/new Date\(([^)]+)\)/g, (m, args) => {
      const parts = args.split(',').map(p => parseInt(p.trim()));
      if (parts.length >= 3) {
        const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
        return JSON.stringify(d.toISOString());
      }
      return 'null';
    });

    let parsed;
    try { parsed = JSON.parse(cleanData); } catch (e) {
      log(`解析失败: ${e.message}`);
      log(`原始: ${worklistData.substring(0, 1000)}`);
      return;
    }

    log(`\n=== 待办任务 ===`);
    log(`总数: ${parsed.total || 0}`);

    if (!parsed.children || parsed.children.length === 0) {
      log('没有待办任务。');
      return;
    }

    // Group by ProcessName
    const groups = {};
    parsed.children.forEach(item => {
      const pn = item.ProcessName || '未知';
      if (!groups[pn]) groups[pn] = [];
      groups[pn].push(item);
    });

    log(`\n按流程类型分组:`);
    for (const [name, items] of Object.entries(groups)) {
      log(`  ${name}: ${items.length}条`);
    }

    log(`\n=== 详细列表 ===`);
    parsed.children.forEach((item, i) => {
      log(`\n--- ${i + 1} ---`);
      log(`  流水号: ${item.SerialNum || ''}`);
      log(`  流程: ${item.ProcessName || ''}`);
      log(`  描述: ${item.Description || ''}`);
      log(`  发起人: ${item.OwnerDisplayName || ''}`);
      log(`  创建: ${item.CreateAt || ''}`);
      log(`  当前节点: ${item.NodeName || '未知'}`);
      log(`  到达时间: ${item.ReceiveAt || ''}`);
    });

    // Flag old items
    const now = Date.now();
    const oldThreshold = 14 * 24 * 60 * 60 * 1000; // 14 days
    const oldItems = parsed.children.filter(item => {
      const t = new Date(item.CreateAt).getTime();
      return now - t > oldThreshold;
    });
    if (oldItems.length > 0) {
      log(`\n⚠️ ${oldItems.length}条超过14天的旧待办:`);
      oldItems.forEach(item => {
        const days = Math.floor((now - new Date(item.CreateAt).getTime()) / (1000 * 60 * 60 * 24));
        log(`  ${item.SerialNum} (${days}天) ${item.Description}`);
      });
    }

  } catch (error) {
    log(`错误: ${error.message}`);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
