const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';
const BPM_URL = 'http://bpm.timesgroup.cn';

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  try {
    console.log('[1] 登录BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(8000);

    // Fetch both APIs
    console.log('[2] 获取数据...');
    
    const [myRequest, workList] = await Promise.all([
      page.evaluate(async () => {
        const p = new URLSearchParams({ method:'GetHistoryTasks', HistoryTaskType:'MyRequest', ThisTaskState:'Running', byYear:'0', start:'0', limit:'500', _dc:Date.now().toString() });
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + p, { credentials:'include' });
        return await r.text();
      }),
      page.evaluate(async () => {
        const p = new URLSearchParams({ method:'GetWorkList', _dc:Date.now().toString() });
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + p, { credentials:'include' });
        return await r.text();
      }),
    ]);

    // Parse (handle new Date format)
    const parseData = (raw) => {
      const clean = raw.replace(/new Date\(([^)]+)\)/g, (m, args) => {
        const parts = args.split(',').map(p => parseInt(p.trim()));
        if (parts.length >= 3) {
          return JSON.stringify(new Date(parts[0], parts[1], parts[2], parts[3]||0, parts[4]||0, parts[5]||0).toISOString());
        }
        return 'null';
      });
      try { return JSON.parse(clean); } catch(e) { return { error: e.message, raw: raw.substring(0,500) }; }
    };

    const myReqData = parseData(myRequest);
    const workData = parseData(workList);

    const myReqItems = myReqData.children || [];
    const workItems = workData.children || [];

    console.log('  我发起的-审批中:', myReqData.total || myReqItems.length);
    console.log('  待办任务:', workData.total || workItems.length);

    // Generate HTML report
    const now = new Date().toLocaleString('zh-CN');

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BPM流程概览</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f0f2f5;color:#333;line-height:1.6}
.container{max-width:1200px;margin:0 auto;padding:20px}
.header{background:#fff;padding:24px;border-radius:8px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.header h1{font-size:20px;color:#1a1a2e}
.header .meta{font-size:13px;color:#888;margin-top:4px}
.stats{display:flex;gap:16px;margin-bottom:16px}
.stat-card{flex:1;background:#fff;padding:20px;border-radius:8px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat-card .num{font-size:32px;font-weight:600}
.stat-card .label{font-size:13px;color:#888;margin-top:4px}
.stat-card.warn .num{color:#e24b4a}
.stat-card.info .num{color:#185fa5}
.section{background:#fff;padding:20px;border-radius:8px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.section h2{font-size:16px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #f0f2f5}
.flow-card{border:1px solid #e8e8e8;border-radius:6px;padding:12px 16px;margin-bottom:8px;transition:box-shadow .2s}
.flow-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.1)}
.flow-card .title{font-size:14px;font-weight:500;color:#1a1a2e}
.flow-card .sn{font-size:12px;color:#1890ff;font-family:monospace}
.flow-card .meta{font-size:12px;color:#888;margin-top:4px}
.flow-card .node{font-size:12px;margin-top:6px;display:flex;align-items:center;gap:8px}
.flow-card .node-badge{background:#fff7e6;color:#d46b08;padding:2px 8px;border-radius:3px;font-size:11px}
.flow-card .node-badge.warn{background:#fff1f0;color:#e24b4a}
.flow-card .node-person{font-size:11px;color:#666}
.flow-card .desc{font-size:12px;color:#555;margin-top:4px;line-height:1.4}
.group-header{font-size:13px;font-weight:500;color:#555;padding:8px 0;margin-top:16px}
.tabs{display:flex;gap:0;margin-bottom:16px}
.tab{padding:8px 20px;background:#fff;border:1px solid #d9d9d9;cursor:pointer;font-size:13px;border-radius:4px 4px 0 0;margin-right:-1px;position:relative}
.tab.active{background:#1890ff;color:#fff;border-color:#1890ff}
.empty{text-align:center;color:#999;padding:40px}
.summary-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
.summary-table th,.summary-table td{padding:8px 12px;text-align:left;border-bottom:1px solid #f0f0f0}
.summary-table th{background:#fafafa;font-weight:500;color:#555}
.summary-table .count{font-family:monospace;color:#1890ff}
</style></head><body><div class="container">
<div class="header"><h1>BPM 流程概览</h1><div class="meta">更新时间: ${now} | 账号: chenjialin3 (陈家林)</div></div>
<div class="stats">
<div class="stat-card info"><div class="num">${myReqItems.length}</div><div class="label">我发起的-审批中</div></div>
<div class="stat-card warn"><div class="num">${workItems.length}</div><div class="label">待办任务</div></div>
</div>`;

    // --- Section: My Request ---
    html += `<div class="section"><h2>我发起的流程 — 审批中 (${myReqItems.length}条)</h2>`;

    if (myReqItems.length === 0) {
      html += '<div class="empty">暂无审批中的流程</div>';
    } else {
      // Group by node/step
      const byNode = {};
      myReqItems.forEach(item => {
        const children = (item.State && item.State.children) || [];
        children.forEach(ch => {
          const node = ch.StepName || ch.RecipientDisplayName || '未知';
          if (!byNode[node]) byNode[node] = [];
          byNode[node].push(item);
        });
      });

      // Summary table
      html += '<table class="summary-table"><tr><th>当前节点</th><th>数量</th><th>处理人</th></tr>';
      Object.entries(byNode).sort((a,b) => b[1].length - a[1].length).forEach(([node, items]) => {
        const person = [...new Set(items.map(i => {
          const ch = (i.State && i.State.children) || [];
          return ch.find(c => c.StepName === node)?.RecipientDisplayName || '';
        }))].filter(Boolean).join(', ');
        html += `<tr><td>${node}</td><td class="count">${items.length}</td><td>${person}</td></tr>`;
      });
      html += '</table>';

      // Recent 7 days
      const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
      const recent = myReqItems.filter(i => i.CreateAt && new Date(i.CreateAt) > weekAgo);
      if (recent.length > 0) {
        html += `<div class="group-header">最近7天新增 (${recent.length}条)</div>`;
        recent.forEach(item => {
          const children = (item.State && item.State.children) || [];
          const steps = children.map(ch => ch.StepName).join(' → ');
          const persons = children.map(ch => ch.RecipientDisplayName).filter(Boolean).join(', ');
          html += `<div class="flow-card">
<div class="title">${item.ProcessName || '未知流程'}</div>
<div class="sn">${item.SerialNum || ''}</div>
<div class="desc">${item.Description || ''}</div>
<div class="meta">${item.CreateAt ? new Date(item.CreateAt).toLocaleString('zh-CN') : ''} | 发起人: ${item.OwnerDisplayName || ''}</div>
<div class="node"><span class="node-badge">${steps || '运行中'}</span><span class="node-person">${persons ? '→ ' + persons : ''}</span></div>
</div>`;
        });
      }
    }
    html += '</div>';

    // --- Section: Work List ---
    html += `<div class="section"><h2>待办任务 (${workItems.length}条)</h2>`;
    if (workItems.length === 0) {
      html += '<div class="empty">暂无待办任务 🎉</div>';
    } else {
      workItems.forEach(item => {
        html += `<div class="flow-card">
<div class="title">${item.ProcessName || '未知流程'}</div>
<div class="sn">${item.SerialNum || ''}</div>
<div class="desc">${item.Description || ''}</div>
<div class="meta">${item.CreateAt ? new Date(item.CreateAt).toLocaleString('zh-CN') : ''} | 发起人: ${item.OwnerDisplayName || ''}</div>
<div class="node"><span class="node-badge warn">待处理</span><span class="node-person">当前节点: ${item.NodeName || '-'}</span></div>
</div>`;
      });
    }
    html += '</div>';

    html += '</div></body></html>';

    const reportPath = path.join(OUT, 'bpm_report.html');
    fs.writeFileSync(reportPath, html);
    console.log('\n✓ 报告: ' + reportPath);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
