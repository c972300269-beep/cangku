// 只读复核：查询 2026-11-06 审批通过的三条流程在历史任务里的状态
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const SNS = ['REQ2026119742', 'REQ2611050250', 'REQ2026119017'];
const TYPES = ['MyApproval', 'MyProcess', 'MyTask', 'Approve', 'Approval', 'MyRequest'];
const STATES = ['Approved', 'Finished', 'Running'];

(async () => {
  const b = await chromium.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    const found = new Map();
    for (const t of TYPES) {
      for (const s of STATES) {
        const raw = await page.evaluate(async ([type, state]) => {
          const q = `method=GetHistoryTasks&HistoryTaskType=${type}&SpecProcessName=&byYear=0&start=0&limit=500&ThisTaskState=${state}&_dc=` + Date.now();
          const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + q, { credentials: 'include' });
          return await r.text();
        }, [t, s]);
        let j = null;
        try { j = JSON.parse(raw.replace(/new Date\(([^)]+)\)/g, '"date"')); } catch (e) { continue; }
        const kids = j.children || [];
        if (!kids.length) continue;
        if (t === 'MyApproval' && s === 'Approved') console.log(`  [样本] MyApproval/Approved total=${j.total} rows=${kids.length} 首行字段=${Object.keys(kids[0]).join(',')}`);
        for (const sn of SNS) {
          const hit = kids.find(x => x.SerialNum === sn);
          if (hit && !found.has(sn)) {
            found.set(sn, { type: t, state: s, total: j.total, item: hit });
          }
        }
      }
    }
    console.log('=== 三条流程历史状态 ===');
    for (const sn of SNS) {
      const f = found.get(sn);
      if (!f) { console.log(`  ${sn}: 历史列表中未命中（仍在流转或未归入上述视图）`); continue; }
      const it = f.item;
      const st = typeof it.State === 'object' ? JSON.stringify(it.State) : it.State;
      console.log(`  ${sn}: 视图=${f.type}/${f.state} total=${f.total}`);
      console.log(`     流程=${it.ProcessName || ''} | 描述=${(it.Description || '').replace(/<br\/>/g, ' ')}`);
      console.log(`     节点=${it.StepName || it.NodeName || ''} | State=${st || ''} | 完成时间=${it.FinishedAt || it.CompleteAt || it.EndAt || ''}`);
      console.log(`     全部字段=${Object.keys(it).join(',')}`);
    }
    console.log('复核完成');
  } finally { await b.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
