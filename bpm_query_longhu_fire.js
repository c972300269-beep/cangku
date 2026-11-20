const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const OUTPUT_DIR = path.join(__dirname, '..', 'bpm_output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cleanDates(txt) {
  return txt.replace(/new Date\(([^)]+)\)/g, (m, a) => {
    const p = a.split(',').map(x => parseInt(x.trim()));
    if (p.length >= 3) {
      const d = new Date(p[0], p[1], p[2], p[3] || 0, p[4] || 0, p[5] || 0);
      return JSON.stringify(d.toISOString());
    }
    return 'null';
  });
}

async function fetchHistory(page, params) {
  const ps = new URLSearchParams(Object.assign({ _dc: Date.now().toString() }, params));
  return await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    return await r.text();
  }, '/YZSoft.Services.REST/BPM/TaskList.ashx?' + ps.toString());
}

async function fetchWorkList(page) {
  const ps = new URLSearchParams({ method: 'GetWorkList', _dc: Date.now().toString() });
  return await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    return await r.text();
  }, '/YZSoft.Services.REST/BPM/TaskList.ashx?' + ps.toString());
}

const KEY = '龙湖苑';
const SUB = '消防';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const results = [];
  const sources = {};
  // 仅含 KEY 的条目（消防无命中时用于排查）
  const keyOnly = [];

  try {
    console.log('登录 BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(12000);

    const queries = [
      { tag: '我发起-审批中(Running)', params: { method: 'GetHistoryTasks', HistoryTaskType: 'MyRequest', ThisTaskState: 'Running', byYear: '0', start: '0', limit: '500' } },
      { tag: '我发起-已审批(Approved)', params: { method: 'GetHistoryTasks', HistoryTaskType: 'MyRequest', ThisTaskState: 'Approved', byYear: '0', start: '0', limit: '3000' } },
      { tag: '我发起-已归档(Finished)', params: { method: 'GetHistoryTasks', HistoryTaskType: 'MyRequest', ThisTaskState: 'Finished', byYear: '0', start: '0', limit: '500' } },
    ];

    for (const q of queries) {
      console.log('查询 ' + q.tag + ' ...');
      const raw = await fetchHistory(page, q.params);
      let arr = [], total = 0, err = '';
      try {
        const j = JSON.parse(cleanDates(raw));
        arr = j.children || [];
        total = j.total || arr.length;
        err = j.errorMessage || '';
      } catch (e) { err = 'PARSE_FAIL:' + e.message; }
      sources[q.tag] = { total, returned: arr.length, err };
      for (const c of arr) {
        const blob = (c.ProcessName || '') + ' ' + (c.Description || '') + ' ' + (c.SerialNum || '');
        const hasKey = blob.includes(KEY);
        if (hasKey && blob.includes(SUB)) {
          results.push({ source: q.tag, SerialNum: c.SerialNum, ProcessName: c.ProcessName, Description: c.Description, State: c.State, NodeName: c.NodeName, Recipient: c.RecipientDisplayName, Owner: c.OwnerDisplayName, CreateAt: c.CreateAt });
        } else if (hasKey) {
          keyOnly.push({ source: q.tag, SerialNum: c.SerialNum, ProcessName: c.ProcessName, Description: c.Description, CreateAt: c.CreateAt });
        }
      }
      await sleep(1500);
    }

    console.log('查询 待办(GetWorkList) ...');
    const wlRaw = await fetchWorkList(page);
    let wlArr = [];
    try { const j = JSON.parse(cleanDates(wlRaw)); wlArr = j.children || []; } catch (e) {}
    sources['待办(GetWorkList)'] = { total: wlArr.length, returned: wlArr.length };
    for (const c of wlArr) {
      const blob = (c.ProcessName || '') + ' ' + (c.Description || '') + ' ' + (c.SerialNum || '');
      const hasKey = blob.includes(KEY);
      if (hasKey && blob.includes(SUB)) {
        results.push({ source: '待办', SerialNum: c.SerialNum, ProcessName: c.ProcessName, Description: c.Description, State: c.State, NodeName: c.NodeName, Recipient: c.RecipientDisplayName, Owner: c.OwnerDisplayName, CreateAt: c.CreateAt });
      } else if (hasKey) {
        keyOnly.push({ source: '待办', SerialNum: c.SerialNum, ProcessName: c.ProcessName, Description: c.Description, CreateAt: c.CreateAt });
      }
    }

    console.log('\n=== 数据源概况 ===');
    console.log(JSON.stringify(sources, null, 2));

    console.log('\n=== 龙湖苑+消防 命中 ' + results.length + ' 条 ===');
    results.forEach((r, i) => {
      console.log(`\n[${i + 1}] 来源=${r.source} 单号=${r.SerialNum}\n  名称=${r.ProcessName}\n  描述=${r.Description}\n  状态=${r.State} 节点=${r.NodeName} 处理人=${r.Recipient}\n  发起=${r.Owner} 创建=${r.CreateAt}`);
    });

    if (results.length === 0) {
      console.log('\n（消防无命中）附：各来源中"龙湖苑"相关条目共 ' + keyOnly.length + ' 条：');
      keyOnly.forEach((c, i) => {
        console.log(`  ${i + 1}. [${c.source}] ${c.SerialNum} | ${c.ProcessName} | ${c.Description} | ${c.CreateAt}`);
      });
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'query_longhu_fire.json'), JSON.stringify({ sources, results, keyOnly }, null, 2));
    console.log('\n已写入 ' + path.join(OUTPUT_DIR, 'query_longhu_fire.json'));
  } catch (e) {
    console.log('错误: ' + e.message);
    console.log(e.stack);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
