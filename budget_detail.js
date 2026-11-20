const fs = require('fs');
const data = JSON.parse(fs.readFileSync('E:/workbuddy/Claw/reports/budget_latest.json', 'utf8'));
const rows = data.rows.map(r => r.filter((_, i) => i % 2 === 0));

// Group rows by org
const orgMap = {};
rows.forEach(r => {
  const org = String(r[1] || '').trim();
  if (!org) return;
  if (!orgMap[org]) orgMap[org] = [];
  orgMap[org].push(r);
});

// Short names for display
const shortNames = {
  '清远物业_清远香海彼岸（飞来湖）': '香海彼岸二期（飞来湖）',
  '清远物业_清远时代水岸（万达西）': '香海彼岸一期（万达西）',
  '清远物业_龙湖苑一期': '龙湖苑一期',
  '统悦物业_雅悦花园（清远）一期': '雅悦花园一期',
};

const orgOrder = Object.keys(shortNames);

// Color palette
const colors = ['#4facfe','#43e97b','#f093fb','#fa709a'];

let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算明细</title>
<style>
*{margin:0;box-sizing:border-box}
body{font:14px "Microsoft YaHei",Arial;padding:20px;background:#f0f2f5;color:#333}
.card{background:#fff;border-radius:8px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.project-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.project-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.project-name{font-size:18px;font-weight:bold;color:#1a1a2e}
.project-kpi{display:flex;gap:16px;font-size:13px;margin-bottom:12px}
.project-kpi span{color:#888}
.project-kpi strong{color:#333}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.kpi-card{background:#f7f8fa;padding:10px 14px;border-radius:6px;text-align:center}
.kpi-card .lbl{font-size:11px;color:#888;margin-bottom:2px}
.kpi-card .val{font-size:20px;font-weight:bold}
.kpi-card .val.red{color:#f5576c}
.kpi-card .val.green{color:#52c41a}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#f7f8fa;color:#444;font-weight:600;padding:8px;border-bottom:2px solid #e8e8e8;text-align:right;white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid #f0f0f0;text-align:right}
td:first-child{text-align:left;font-weight:500}
tr:hover{background:#f5f7ff}
tr.total-row{font-weight:bold;background:#fafafa;border-top:2px solid #e8e8e8}
.neg{color:#f5576c}
.summary-bar{display:flex;gap:20px;align-items:center;margin-bottom:16px}
.summary-bar h1{font-size:20px;color:#1a1a2e}
.summary-bar span{color:#888;font-size:13px}
.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
.total-card{padding:14px 16px;border-radius:8px;color:#fff;text-align:center}
.total-card .lbl{font-size:12px;opacity:.85}
.total-card .val{font-size:22px;font-weight:bold;margin-top:4px}
.category-row td:first-child{padding-left:24px;font-weight:normal;color:#555}
.tree-l1 td:first-child{font-weight:600;color:#1a1a2e;background:#f9f9fb}
</style></head><body>`;

// Grand totals
let gtB = 0, gtU = 0;

// Per project sections
orgOrder.forEach((orgFull, oi) => {
  const short = shortNames[orgFull];
  const items = orgMap[orgFull];
  if (!items) return;

  // Find top-level and leaf items
  // Top-level: 设备设施维护支出 (summary row)
  // L2: 维修及物料成本, 设备设施维护合同成本, 公共设施设备专项改造费用
  // L3: leaf items under L2
  const topItems = items.filter(r => r[0] === '设备设施维护支出');
  const subItems = items.filter(r => r[0] !== '设备设施维护支出');

  const orgB = subItems.reduce((s, r) => s + (parseFloat(String(r[2]||'0').replace(/,/g,''))||0), 0);
  const orgU = subItems.reduce((s, r) => s + (parseFloat(String(r[3]||'0').replace(/,/g,''))||0), 0);
  const orgR = orgB - orgU;
  gtB += orgB; gtU += orgU;

  const rate = orgB > 0 ? (orgU/orgB*100) : 0;

  // Group sub items by category (using the first keyword)
  const categories = {};
  subItems.forEach(r => {
    const name = String(r[0]||'');
    let cat = name;
    if (name.includes('维修及材料')) cat = '维修及材料';
    else if (name.includes('合同')) cat = '合同费用';
    else if (name.includes('公共设施日常维护') || name.includes('公共设施设备专项')) cat = '公共设施维护';
    
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  });

  html += `<div class="card">
<div class="project-header">
<div class="project-dot" style="background:${colors[oi]}"></div>
<div class="project-name">${short}</div>
</div>
<div class="kpi-grid">
<div class="kpi-card"><div class="lbl">年预算</div><div class="val">¥${orgB.toLocaleString()}</div></div>
<div class="kpi-card"><div class="lbl">年已使用</div><div class="val red">¥${orgU.toLocaleString()}</div></div>
<div class="kpi-card"><div class="lbl">年剩余</div><div class="val ${orgR<0?'red':'green'}">¥${orgR.toLocaleString()}</div></div>
<div class="kpi-card"><div class="lbl">使用率</div><div class="val ${rate>80?'red':''}">${rate.toFixed(1)}%</div></div>
</div>

<table><thead><tr>
<th>科目</th><th>年预算</th><th>年已使用</th><th>年剩余</th><th>1月</th><th>2月</th><th>3月</th><th>4月</th><th>5月</th><th>6月</th><th>7月</th>
</tr></thead><tbody>`;

  // Sort: top-level first, then sub-items by name
  const displayItems = [...subItems];
  displayItems.sort((a, b) => {
    const aName = String(a[0]||'');
    const bName = String(b[0]||'');
    // Group by category
    const catOrder = ['维修及材料','合同费用','公共设施维护'];
    const aCat = catOrder.findIndex(c => aName.includes(c.replace('及材料','')) || aName.includes(c.replace('费用','')));
    const bCat = catOrder.findIndex(c => bName.includes(c.replace('及材料','')) || bName.includes(c.replace('费用','')));
    if (aCat !== bCat) return (aCat===-1?99:aCat) - (bCat===-1?99:bCat);
    return aName.localeCompare(bName);
  });

  displayItems.forEach(r => {
    const name = String(r[0]||'');
    const budget = parseFloat(String(r[2]||'0').replace(/,/g,''))||0;
    const used = parseFloat(String(r[3]||'0').replace(/,/g,''))||0;
    const remain = budget - used;

    if (budget === 0 && used === 0) return; // skip empty

    html += `<tr><td>${name}</td>`;
    html += `<td>${budget > 0 ? '¥'+budget.toLocaleString() : '-'}</td>`;
    html += `<td>${used > 0 ? '¥'+used.toLocaleString() : '-'}</td>`;
    html += `<td class="${remain<0?'neg':''}">${remain!==0 ? '¥'+remain.toLocaleString() : '¥0'}</td>`;
    for (let m=1; m<=7; m++) {
      const uidx = 6 + (m-1)*3;
      const mUsed = parseFloat(String(r[uidx]||'0').replace(/,/g,''))||0;
      html += `<td>${mUsed>0 ? '¥'+mUsed.toLocaleString() : '-'}</td>`;
    }
    html += '</tr>';
  });

  // Total row
  html += `<tr class="total-row"><td>小计</td>`;
  html += `<td>¥${orgB.toLocaleString()}</td>`;
  html += `<td>¥${orgU.toLocaleString()}</td>`;
  html += `<td class="${orgR<0?'neg':''}">¥${orgR.toLocaleString()}</td>`;
  html += '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
  html += `</tr></tbody></table></div>`;
});

// Grand total header
const gr = gtB - gtU;
const grRate = gtB > 0 ? (gtU/gtB*100) : 0;

html = html.replace('<body>', `<body>
<div class="card" style="margin-bottom:20px">
<h1 style="margin-bottom:4px">2026年预算 | 科目13403 设备设施维护支出</h1>
<div style="color:#888;font-size:13px;margin-bottom:16px">${new Date().toLocaleString('zh-CN')} | ${rows.length}条明细 | ${orgOrder.length}个项目</div>
<div class="totals">
<div class="total-card" style="background:linear-gradient(135deg,#667eea,#764ba2)"><div class="lbl">年预算总额</div><div class="val">¥${gtB.toLocaleString()}</div></div>
<div class="total-card" style="background:linear-gradient(135deg,#f093fb,#f5576c)"><div class="lbl">年已使用</div><div class="val">¥${gtU.toLocaleString()}</div></div>
<div class="total-card" style="background:linear-gradient(135deg,#43e97b,#38f9d7);color:#333"><div class="lbl">年剩余</div><div class="val">¥${gr.toLocaleString()}</div></div>
<div class="total-card" style="background:linear-gradient(135deg,#fa709a,#fee140);color:#333"><div class="lbl">总使用率</div><div class="val">${grRate.toFixed(1)}%</div></div>
</div>
</div>`);

html += '</body></html>';
fs.writeFileSync('E:/workbuddy/Claw/reports/budget_latest.html', html);
console.log('Done: ' + orgOrder.length + ' projects, total budget=' + gtB.toLocaleString() + ', used=' + gtU.toLocaleString());
