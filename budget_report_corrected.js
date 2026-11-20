const fs = require('fs');
const path = require('path');

// Load data - only 设备设施维护支出 rows
const jsonPath = path.join(__dirname, '..', '..', 'reports', 'budget_latest.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const allRows = data.rows || [];

// Filter and dedup
const rows = allRows.filter(r => r[0] === '设备设施维护支出' || r[0] === '13403');
const seen = new Set();
const deduped = rows.filter(r => { const k = r.slice(0,5).join('|'); if (seen.has(k)) return false; seen.add(k); return true; });

// Org totals
const orgs = {};
deduped.forEach(r => {
  const sn = r[1].replace(/.*_/, '');
  const b = parseFloat((r[2]||'0').replace(/,/g,'')) || 0;
  const u = parseFloat((r[3]||'0').replace(/,/g,'')) || 0;
  if (!orgs[sn]) orgs[sn] = {budget:0, used:0};
  orgs[sn].budget += b;
  orgs[sn].used += u;
});

let totalB = 0, totalU = 0;
for (const t of Object.values(orgs)) { totalB += t.budget; totalU += t.used; }

const fmt = n => n.toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});
const now = new Date().toLocaleString('zh-CN');
const rate = (totalU/totalB*100).toFixed(1);

let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算-13403</title>
<style>body{font-family:"Microsoft YaHei",Arial;margin:0;padding:20px;background:#f0f2f5}
.card{background:#fff;border-radius:8px;padding:20px;margin-bottom:15px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
h1{color:#1a1a2e;margin:0 0 5px;font-size:18px}.meta{color:#888;font-size:12px;margin-bottom:12px}
.kpi{display:flex;gap:12px;margin-bottom:15px}
.kpi-item{flex:1;background:linear-gradient(135deg,#4facfe,#00f2fe);color:#fff;padding:12px 14px;border-radius:8px}
.kpi-item.warn{background:linear-gradient(135deg,#fa709a,#fee140);color:#333}
.kpi-item .label{font-size:12px;opacity:.85}.kpi-item .value{font-size:20px;font-weight:bold;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #e8e8e8;padding:8px 10px;text-align:right}
th{background:#f5f5f5;color:#333;font-weight:600}td:first-child{text-align:left}
tr:hover{background:#f0f7ff}.total-row td{font-weight:bold;background:#f5f5f5}
.bar-wrap{display:inline-block;width:80px;height:12px;background:#eee;border-radius:3px;vertical-align:middle;margin-left:6px}
.bar{display:block;height:100%;border-radius:3px}.bar.g{background:#52c41a}.bar.y{background:#faad14}.bar.r{background:#f5222d}
</style></head><body>
<div class="card">
<h1>2026年预算 | 科目13403 设备设施维护支出</h1>
<div class="meta">查询时间: ${now} | 组织: 4个</div>
<div class="kpi">
<div class="kpi-item"><div class="label">年预算总额</div><div class="value">¥${fmt(totalB)}</div></div>
<div class="kpi-item warn"><div class="label">年已使用</div><div class="value">¥${fmt(totalU)}</div></div>
<div class="kpi-item"><div class="label">年剩余</div><div class="value">¥${fmt(totalB-totalU)}</div></div>
<div class="kpi-item"><div class="label">使用率</div><div class="value">${rate}%</div></div>
</div>
<table><thead><tr><th>预算组织</th><th>年预算数</th><th>年已使用</th><th>年剩余预算</th><th>使用率</th></tr></thead><tbody>`;

for (const [org, t] of Object.entries(orgs).sort((a,b) => b[1].budget - a[1].budget)) {
  const r = (t.used/t.budget*100).toFixed(1);
  const cls = parseFloat(r) > 80 ? 'r' : parseFloat(r) > 60 ? 'y' : 'g';
  html += `<tr><td><b>${org}</b></td><td>¥${fmt(t.budget)}</td><td>¥${fmt(t.used)}</td><td style="color:${t.used<=t.budget?'#52c41a':'#f5222d'}">¥${fmt(t.budget-t.used)}</td><td>${r}% <span class="bar-wrap"><span class="bar ${cls}" style="width:${r}%"></span></span></td></tr>`;
}
html += `<tr class="total-row"><td>合计</td><td>¥${fmt(totalB)}</td><td>¥${fmt(totalU)}</td><td>¥${fmt(totalB-totalU)}</td><td>${rate}%</td></tr>`;
html += `</tbody></table></div></body></html>`;

const out = 'E:/workbuddy/Claw/reports/budget_latest.html';
fs.writeFileSync(out, html);
console.log('Done: reports/budget_latest.html');
console.log(`Budget: ¥${fmt(totalB)} / Used: ¥${fmt(totalU)} / Rate: ${rate}%`);
