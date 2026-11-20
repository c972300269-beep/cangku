const fs = require('fs');
const data = JSON.parse(fs.readFileSync('E:/workbuddy/Claw/reports/budget_latest.json', 'utf8'));

// Each value appears twice in raw data -> take even columns
const headers = data.headers.filter((_, i) => i % 2 === 0);
const rows = data.rows.map(r => r.filter((_, i) => i % 2 === 0));

console.log('Headers: ' + headers.length + ' | Rows: ' + rows.length);

// Build summary: group by org (col 1), sum budget (col 2), sum used (col 3)
const summary = {};
rows.forEach(r => {
  const org = String(r[1] || '').trim();
  const budget = parseFloat(String(r[2] || '0').replace(/,/g, '')) || 0;
  const used = parseFloat(String(r[3] || '0').replace(/,/g, '')) || 0;
  if (org) {
    if (!summary[org]) summary[org] = { budget: 0, used: 0 };
    summary[org].budget += budget;
    summary[org].used += used;
  }
});

const sorted = Object.entries(summary).sort((a, b) => b[1].used - a[1].used);
let totalBudget = 0, totalUsed = 0;

// HTML
let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算</title>
<style>
*{margin:0;box-sizing:border-box}
body{font:14px "Microsoft YaHei",Arial;padding:20px;background:#f0f2f5;color:#333}
.card{background:#fff;border-radius:8px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;color:#1a1a2e;margin-bottom:4px}
h2{font-size:16px;color:#555;margin:0 0 12px;font-weight:normal}
.summary-line{display:flex;gap:20px;margin-bottom:16px}
.summary-line span{color:#888;font-size:13px}
.kpigrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.kpi{background:linear-gradient(135deg,#4facfe,#00f2fe);color:#fff;padding:14px 16px;border-radius:8px}
.kpi.used{background:linear-gradient(135deg,#f093fb,#f5576c)}
.kpi.remain{background:linear-gradient(135deg,#a8edea,#fed6e3);color:#333}
.kpi .lbl{font-size:12px;opacity:.85}
.kpi .val{font-size:24px;font-weight:bold;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#f7f8fa;color:#444;font-weight:600;padding:10px 8px;border-bottom:2px solid #e8e8e8;text-align:right;white-space:nowrap}
td{padding:8px;border-bottom:1px solid #f0f0f0;text-align:right}
td:first-child,td:nth-child(2){text-align:left}
tr:hover{background:#f5f7ff}
.neg{color:#f5576c;font-weight:600}
.bar-wrap{display:inline-block;width:80px;height:14px;background:#eee;border-radius:7px;vertical-align:middle;margin-left:6px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:7px;min-width:3px}
.bar-fill.over{background:linear-gradient(90deg,#f093fb,#f5576c)}
</style></head><body>`;

html += `<div class="card">
<h1>2026年预算 | 科目13403 设备设施维护支出</h1>
<div class="summary-line"><span>${new Date().toLocaleString('zh-CN')} 查询</span><span>${rows.length} 条明细 | ${sorted.length} 个组织</span></div>`;

// KPI
const allB = sorted.reduce((s, e) => s + e[1].budget, 0);
const allU = sorted.reduce((s, e) => s + e[1].used, 0);
const rem = allB - allU;

html += `<div class="kpigrid">
<div class="kpi"><div class="lbl">年预算总额</div><div class="val">¥${allB.toLocaleString()}</div></div>
<div class="kpi used"><div class="lbl">年已使用</div><div class="val">¥${allU.toLocaleString()}</div></div>
<div class="kpi remain"><div class="lbl">年剩余</div><div class="val" style="color:${rem < 0 ? '#f5576c' : '#333'}">¥${rem.toLocaleString()}</div></div>
</div>`;

// Summary table
html += `<table><thead><tr>
<th>预算组织</th><th style="width:120px">年预算</th><th style="width:120px">年已使用</th><th style="width:120px">年剩余</th><th style="width:100px">使用率</th>
</tr></thead><tbody>`;

sorted.forEach(([org, s]) => {
  const remain = s.budget - s.used;
  const rate = s.budget > 0 ? (s.used / s.budget * 100) : 0;
  html += `<tr>
<td>${org}</td>
<td>¥${s.budget.toLocaleString()}</td>
<td>¥${s.used.toLocaleString()}</td>
<td class="${remain < 0 ? 'neg' : ''}">¥${remain.toLocaleString()}</td>
<td>${rate.toFixed(1)}%<div class="bar-wrap"><div class="bar-fill${rate > 100 ? ' over' : ''}" style="width:${Math.min(rate, 100)}%"></div></div></td>
</tr>`;
  totalBudget += s.budget;
  totalUsed += s.used;
});

html += `<tr style="font-weight:bold;background:#fafafa">
<td>合计</td><td>¥${totalBudget.toLocaleString()}</td><td>¥${totalUsed.toLocaleString()}</td>
<td class="${(totalBudget - totalUsed) < 0 ? 'neg' : ''}">¥${(totalBudget - totalUsed).toLocaleString()}</td>
<td>${totalBudget > 0 ? (totalUsed / totalBudget * 100).toFixed(1) + '%' : '-'}</td>
</tr></tbody></table></div>`;

// Monthly detail
const hasUsed = rows.filter(r => parseFloat(String(r[3] || '0').replace(/,/g, '')) > 0);
if (hasUsed.length > 0) {
  html += `<div class="card"><h2>月度明细（有支出记录，共 ${hasUsed.length} 条）</h2>`;
  html += `<table><thead><tr><th>科目</th><th>组织</th><th>年预算</th><th>年使用</th><th>年剩余</th>`;
  for (let m = 1; m <= 7; m++) html += `<th>${m}月</th>`;
  html += `</tr></thead><tbody>`;
  hasUsed.forEach(r => {
    html += `<tr><td>${r[0] || ''}</td><td>${r[1] || ''}</td>`;
    html += `<td>${r[2] || '0'}</td><td>${r[3] || '0'}</td><td>${r[4] || '0'}</td>`;
    for (let m = 1; m <= 7; m++) {
      const uidx = 6 + (m - 1) * 3;
      html += `<td>${r[uidx] || '0'}</td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table></div>';
}

html += '</body></html>';
fs.writeFileSync('E:/workbuddy/Claw/reports/budget_latest.html', html);

console.log('Budget: ' + totalBudget.toLocaleString() + ' | Used: ' + totalUsed.toLocaleString() + ' | Remain: ' + (totalBudget - totalUsed).toLocaleString());
console.log('Orgs: ' + sorted.length + ' | Rows: ' + rows.length);
console.log('OK');
