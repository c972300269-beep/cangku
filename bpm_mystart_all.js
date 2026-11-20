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

async function fetchState(page, state) {
  const params = new URLSearchParams({
    method: 'GetHistoryTasks',
    HistoryTaskType: 'MyRequest',
    ThisTaskState: state,
    byYear: '0',
    start: '0',
    limit: '500',
    _dc: Date.now().toString()
  });
  const res = await page.evaluate(async (qs) => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + qs, { credentials: 'include' });
    return await r.text();
  }, params.toString());
  return res;
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

    const all = [];
    for (const state of ['Running', 'Finished']) {
      log(`获取 ${state} 状态...`);
      const raw = await fetchState(page, state);
      const clean = raw.replace(/new Date\(([^)]+)\)/g, (m, args) => {
        const parts = args.split(',').map(p => parseInt(p.trim()));
        if (parts.length >= 3) {
          const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
          return JSON.stringify(d.toISOString());
        }
        return 'null';
      });
      try {
        const parsed = JSON.parse(clean);
        const arr = parsed.children || [];
        log(`${state}: ${arr.length} 条`);
        all.push(...arr.map(c => ({ ...c, _State: state })));
      } catch (e) {
        log(`${state} 解析失败: ${e.message}`);
      }
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'my_requests_all.json'), JSON.stringify(all, null, 2));
    log(`\n共合并 ${all.length} 条（审批中 + 已完结）`);

    // 过滤龙湖苑 + 监控/安装
    const hits = all.filter(c => {
      const blob = (c.ProcessName || '') + (c.Description || '');
      return /龙湖苑/.test(blob) && /监控|安装/.test(blob);
    });
    log(`\n=== 龙湖苑+监控/安装 命中 ${hits.length} 条 ===`);
    hits.forEach((c, i) => {
      log(`\n[${i + 1}] 状态=${c._State} 单号=${c.SerialNum} 名称=${c.ProcessName} 描述=${c.Description} 发起=${c.OwnerDisplayName} 创建=${c.CreateAt} 节点=${c.NodeName}`);
    });

    if (hits.length === 0) {
      // 列出所有龙湖苑相关，方便排查
      const longhu = all.filter(c => /龙湖苑/.test((c.ProcessName || '') + (c.Description || '')));
      log(`\n（无监控安装命中）龙湖苑相关共 ${longhu.length} 条：`);
      longhu.forEach((c, i) => {
        log(`  ${c._State} | ${c.SerialNum} | ${c.ProcessName} | ${c.Description} | ${c.CreateAt}`);
      });
    }
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
