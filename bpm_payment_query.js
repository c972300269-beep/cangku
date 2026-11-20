const { chromium } = require('playwright');

const BPM_URL = 'http://bpm.timesgroup.cn';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN', ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await ctx.newPage();

  try {
    log('登录BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);
    log('登录完成');

    const allPayments = [];
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

      for (const item of children) {
        const pname = item.ProcessName || '';
        // Filter payment/请款 related processes
        if (pname.includes('请款') || pname.includes('付款') || pname.includes('结算') || pname.includes('报销')) {
          allPayments.push(item);
        }
      }

      log(`分页 ${start}-${start+children.length} → 已找到 ${allPayments.length} 条请款/付款`);
      if (start + children.length >= parsed.total || children.length === 0) break;
      start += limit;
    }

    log(`\n=== 请款/付款/报销流程: ${allPayments.length}条 ===\n`);

    // Sort by time desc
    allPayments.sort((a, b) => new Date(b.CreateAt) - new Date(a.CreateAt));

    // Show 2026 only for "近期"
    const recent = allPayments.filter(r => {
      const d = new Date(r.CreateAt);
      return d.getFullYear() === 2026;
    });

    log(`2026年: ${recent.length}条\n`);

    console.log('| # | 流水号 | 日期 | 流程类型 | 描述 |');
    console.log('|---|--------|------|----------|------|');
    recent.forEach((s, i) => {
      console.log(`| ${i+1} | ${s.SerialNum} | ${(s.CreateAt||'').substring(0,10)} | ${s.ProcessName} | ${(s.Description||'').substring(0,60)} |`);
    });

    // Summary by process type
    console.log('\n### 按流程类型');
    const types = {};
    recent.forEach(r => { types[r.ProcessName] = (types[r.ProcessName]||0) + 1; });
    Object.entries(types).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`| ${k} | ${v}条 |`));

    console.log(`\n总计 ${recent.length} 条请款/付款通过流程`);

  } catch (e) {
    log(`错误: ${e.message}`);
    log(e.stack);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
