const fs = require('fs');
const OUT = 'E:/workbuddy/Claw/reports';

const allData = {
  '香海彼岸（飞来湖）': [
    ['设备设施维护支出',1119718.58,847031.18],
    ['维修及物料成本',488800,266587.08],
    ['空调设备维修费用',4000,0],
    ['供配电系统维修及材料费用',26400,1913.01],
    ['给排水系统和水池维修及材料费用',29000,31956.15],
    ['消防水池清理',29000,0],
    ['公共设施日常维护',261000,130501.33],
    ['电梯设备维修及材料费用',62400,22272.74],
    ['消防系统维修及材料费用',42000,16038.10],
    ['弱电系统设备维修及材料费用',64000,63905.75],
    ['设备设施维护合同成本',630918.58,580444.10],
    ['电梯设备维护保养合同及年审费用',200712,170712],
    ['消防系统维护保养合同费用',129918.10,128453.40],
    ['弱电系统设备维护保养合同费用',227232.20,219754],
    ['化粪池清理及管道疏通维护合同费用',24564,23520.87],
    ['公共设施设备专项改造费用',38892.28,36690.83],
    ['给排水系统和水池保养合同费用',9600,1313],
  ],
  '时代水岸（万达西）': [
    ['设备设施维护支出',706756.44,538530.92],
    ['维修及物料成本',322776,198393.98],
    ['空调设备维修费用',2300,804.76],
    ['供配电系统维修及材料费用',6796,6737.75],
    ['给排水系统和水池维修及材料费用',16400,5287.10],
    ['消防水池清理',16400,0],
    ['公共设施日常维护',148000,102809.58],
    ['电梯设备维修及材料费用',60000,49539.04],
    ['消防系统维修及材料费用',65780,11332.60],
    ['弱电系统设备维修及材料费用',23500,21883.15],
    ['设备设施维护合同成本',383980.44,340136.94],
    ['电梯设备维护保养合同及年审费用',112608,91008],
    ['消防系统维护保养合同费用',103844.64,84344.64],
    ['弱电系统设备维护保养合同费用',150492,150492],
    ['化粪池清理及管道疏通维护合同费用',13635.84,13635.80],
    ['给排水系统和水池保养合同费用',3399.96,656.50],
  ],
  '龙湖苑一期': [
    ['设备设施维护支出',54495.20,29641.07],
    ['维修及物料成本',30560,7063.50],
    ['空调设备维修费用',600,0],
    ['给排水系统和水池维修及材料费用',3000,713.50],
    ['消防水池清理',3000,0],
    ['公共设施日常维护',12000,1700],
    ['电梯设备维修及材料费用',7300,4650],
    ['消防系统维修及材料费用',4660,0],
    ['弱电系统设备维修及材料费用',3000,0],
    ['设备设施维护合同成本',23935.20,22577.57],
    ['电梯设备维护保养合同及年审费用',15264,14304],
    ['消防系统维护保养合同费用',6547.20,6546.84],
    ['化粪池清理及管道疏通维护合同费用',1104,1070.23],
    ['给排水系统和水池保养合同费用',1020,656.50],
  ],
  '雅悦花园（清远）一期': [
    ['设备设施维护支出',193866.05,126359.57],
    ['维修及物料成本',106512.77,44525.74],
    ['空调设备维修费用',2000,750.47],
    ['供配电系统维修及材料费用',4260,0],
    ['给排水系统和水池维修及材料费用',4250,13170.01],
    ['消防水池清理',4250,2533.50],
    ['公共设施日常维护',41000,29805.26],
    ['电梯设备维修及材料费用',21000,800],
    ['消防系统维修及材料费用',34002.77,0],
    ['设备设施维护合同成本',87353.28,81833.83],
    ['电梯设备维护保养合同及年审费用',58680,53790],
    ['消防系统维护保养合同费用',24321.24,24321.20],
    ['化粪池清理及管道疏通维护合同费用',4352.04,3722.63],
  ],
};

const fmt = n => n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const now = new Date().toLocaleString('zh-CN');

let grandBudget = 0, grandUsed = 0;
const orgTotals = {};
for (const [org, items] of Object.entries(allData)) {
  const tb = items.reduce((s,i)=>s+i[1],0);
  const tu = items.reduce((s,i)=>s+i[2],0);
  orgTotals[org] = {budget:tb, used:tu};
  grandBudget += tb; grandUsed += tu;
}
const rate = (grandUsed/grandBudget*100).toFixed(1);

let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算-科目13403全子项</title>';
html += '<style>body{font-family:"Microsoft YaHei",Arial;margin:0;padding:20px;background:#f0f2f5}';
html += '.card{background:#fff;border-radius:8px;padding:20px;margin-bottom:15px;box-shadow:0 1px 3px rgba(0,0,0,.1)}';
html += 'h1{color:#1a1a2e;margin:0 0 5px;font-size:18px}.meta{color:#888;font-size:12px;margin-bottom:12px}';
html += '.kpi{display:flex;gap:12px;margin-bottom:15px}';
html += '.kpi-item{flex:1;background:linear-gradient(135deg,#4facfe,#00f2fe);color:#fff;padding:12px 14px;border-radius:8px}';
html += '.kpi-item.warn{background:linear-gradient(135deg,#fa709a,#fee140);color:#333}';
html += '.kpi-item .label{font-size:12px;opacity:.85}.kpi-item .value{font-size:20px;font-weight:bold;margin-top:4px}';
html += 'table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}';
html += 'th,td{border:1px solid #e8e8e8;padding:6px 10px;text-align:right}';
html += 'th{background:#f5f5f5;color:#333;font-weight:600}td:first-child{text-align:left}';
html += 'tr:hover{background:#f0f7ff}.cat-header td{background:#e6f7ff;font-weight:bold;font-size:13px}';
html += '.sub td:first-child{padding-left:24px;color:#555}';
html += '.total-row td{font-weight:bold;background:#f5f5f5}';
html += '</style></head><body>';

html += '<div class="card"><h1>2026年预算 | 科目13403 设备设施维护支出（含全部子项）</h1>';
html += '<div class="meta">查询时间: '+now+' | 组织: 4个</div>';
html += '<div class="kpi">';
html += '<div class="kpi-item"><div class="label">年预算总额</div><div class="value">¥'+fmt(grandBudget)+'</div></div>';
html += '<div class="kpi-item warn"><div class="label">年已使用</div><div class="value">¥'+fmt(grandUsed)+'</div></div>';
html += '<div class="kpi-item"><div class="label">年剩余</div><div class="value">¥'+fmt(grandBudget-grandUsed)+'</div></div>';
html += '<div class="kpi-item"><div class="label">使用率</div><div class="value">'+rate+'%</div></div>';
html += '</div>';

html += '<table><thead><tr><th>预算组织</th><th>年预算数</th><th>年已使用</th><th>年剩余预算</th><th>使用率</th></tr></thead><tbody>';
for (const [org, t] of Object.entries(orgTotals).sort((a,b)=>b[1].budget-a[1].budget)) {
  const r = (t.used/t.budget*100).toFixed(1);
  html += '<tr><td><b>'+org+'</b></td><td>¥'+fmt(t.budget)+'</td><td>¥'+fmt(t.used)+'</td><td style="color:#52c41a">¥'+fmt(t.budget-t.used)+'</td><td>'+r+'%</td></tr>';
}
html += '<tr class="total-row"><td>合计</td><td>¥'+fmt(grandBudget)+'</td><td>¥'+fmt(grandUsed)+'</td><td>¥'+fmt(grandBudget-grandUsed)+'</td><td>'+rate+'%</td></tr>';
html += '</tbody></table></div>';

html += '<div class="card"><h2>子科目明细（按组织）</h2>';
for (const [org, items] of Object.entries(allData)) {
  html += '<table style="margin-bottom:4px"><thead><tr class="cat-header"><td colspan="5">'+org+'</td></tr>';
  html += '<tr><th>子科目</th><th>年预算</th><th>年已使用</th><th>年剩余</th><th>使用率</th></tr></thead><tbody>';
  const sorted = [...items].sort((a,b)=>b[1]-a[1]);
  for (const item of sorted) {
    const remain = item[1]-item[2];
    const ir = item[1]>0?(item[2]/item[1]*100).toFixed(1):'0';
    html += '<tr class="sub"><td>'+item[0]+'</td><td>¥'+fmt(item[1])+'</td><td>¥'+fmt(item[2])+'</td><td style="color:'+(remain>=0?'#52c41a':'#f5222d')+'\">¥'+fmt(remain)+'</td><td>'+ir+'%</td></tr>';
  }
  const ob = items.reduce((s,i)=>s+i[1],0);
  const ou = items.reduce((s,i)=>s+i[2],0);
  const or = (ou/ob*100).toFixed(1);
  html += '<tr class="total-row"><td>小计</td><td>¥'+fmt(ob)+'</td><td>¥'+fmt(ou)+'</td><td>¥'+fmt(ob-ou)+'</td><td>'+or+'%</td></tr>';
  html += '</tbody></table><br>';
}
html += '</div></body></html>';

fs.writeFileSync(OUT+'/budget_latest.html', html);
console.log('Done: reports/budget_latest.html');
console.log('总预算: ¥' + fmt(grandBudget));
console.log('已使用: ¥' + fmt(grandUsed));
console.log('使用率: ' + rate + '%');
