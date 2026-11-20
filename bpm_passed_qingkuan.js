const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' });
  const page = await context.newPage();

  try {
    log('登录 BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(12000);

    const queries = [
      { name: 'approved_latest', params: { method: 'GetHistoryTasks', HistoryTaskType: 'MyRequest', ThisTaskState: 'Approved', byYear: '0', start: '0', limit: '3000' } },
      { name: 'running_latest', params: { method: 'GetHistoryTasks', HistoryTaskType: 'MyRequest', ThisTaskState: 'Running', byYear: '0', start: '0', limit: '500' } }
    ];

    for (const q of queries) {
      log('查询 ' + q.name + ' ...');
      const params = new URLSearchParams(Object.assign({ _dc: Date.now().toString() }, q.params));
      const text = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        return await res.text();
      }, '/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString());
      const file = path.join(OUTPUT_DIR, 'hist_' + q.name + '.json');
      fs.writeFileSync(file, text);
      let total = '?';
      try { total = JSON.parse(text.replace(/new Date\(([^)]+)\)/g, '"$1"')).total; } catch (e) {}
      log(q.name + ' 长度=' + text.length + ' total=' + total + ' -> ' + file);
    }
    log('全部完成');
  } catch (e) {
    log('错误: ' + e.message);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
