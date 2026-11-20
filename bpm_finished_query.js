const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 处理 new Date(...) 格式
function cleanDates(txt) {
  return txt.replace(/new Date\(([^)]+)\)/g, (m, args) => {
    const parts = args.split(',').map(p => parseInt(p.trim()));
    if (parts.length >= 3) {
      const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
      return JSON.stringify(d.toISOString());
    }
    return 'null';
  });
}

async function fetchHistory(page, HistoryTaskType, ThisTaskState) {
  const params = new URLSearchParams({
    method: 'GetHistoryTasks',
    HistoryTaskType,
    ThisTaskState,
    byYear: '0',
    start: '0',
    limit: '500',
    _dc: Date.now().toString()
  });
  const res = await page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: 'include' });
    return await r.text();
  }, '/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString());
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
    await sleep(9000);

    const combos = [
      ['MyRequest', 'Finished'],
      ['MyRequest', 'Running'],
      ['MyProcess', 'Finished'],
      ['MyProcess', 'Running'],
    ];

    const out = {};
    for (const [ht, ts] of combos) {
      log(`查询 ${ht} / ${ts} ...`);
      const raw = await fetchHistory(page, ht, ts);
      const fn = `hist_${ht}_${ts}.json`;
      fs.writeFileSync(path.join(OUTPUT_DIR, fn), raw);
      let total = 0, err = '';
      try {
        const j = JSON.parse(cleanDates(raw));
        total = j.total || (j.children ? j.children.length : 0);
        err = j.errorMessage || '';
      } catch (e) {
        err = 'PARSE_FAIL:' + e.message;
      }
      out[`${ht}/${ts}`] = { file: fn, total, err, len: raw.length };
      log(`  -> ${ht}/${ts}: total=${total} err=${err} len=${raw.length}`);
      await sleep(1500);
    }

    // 额外尝试：可能 ThisTaskState 取值不同
    for (const alt of ['Completed', 'Approved', 'Processed']) {
      log(`尝试 MyRequest / ${alt} ...`);
      const raw = await fetchHistory(page, 'MyRequest', alt);
      const fn = `hist_MyRequest_${alt}.json`;
      fs.writeFileSync(path.join(OUTPUT_DIR, fn), raw);
      let total = 0, err = '';
      try {
        const j = JSON.parse(cleanDates(raw));
        total = j.total || (j.children ? j.children.length : 0);
        err = j.errorMessage || '';
      } catch (e) { err = 'PARSE_FAIL'; }
      out[`MyRequest/${alt}`] = { file: fn, total, err, len: raw.length };
      log(`  -> MyRequest/${alt}: total=${total} err=${err}`);
      await sleep(1200);
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'finished_query_summary.json'), JSON.stringify(out, null, 2));
    log('SUMMARY:');
    log(JSON.stringify(out, null, 2));
  } catch (error) {
    log(`错误: ${error.message}`);
    log(error.stack);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
