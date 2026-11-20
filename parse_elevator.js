const fs = require('fs');
const data = JSON.parse(fs.readFileSync('E:/workbuddy/Claw/reports/budget_latest_full.json', 'utf8'));
const rows = data.indentRows || [];
const orgMap = {
  '清远物业_清远香海彼岸（飞来湖）': '香海二期(飞来湖)',
  '清远物业_清远时代水岸（万达西）': '香海一期(万达西)',
  '清远物业_龙湖苑一期': '龙湖苑一期',
  '统悦物业_雅悦花园（清远）一期': '雅悦花园'
};
const out = {};
for (const r of rows) {
  const v = r.vals;
  const name = v[0] || '';
  const org = v[1] || '';
  if (!name.includes('电梯')) continue;
  if (!orgMap[org]) continue;
  if (name.includes('邻里')) continue; // skip split allocation rows
  const type = name.includes('维修及材料') ? 'repair' : (name.includes('维护保养') ? 'maint' : 'other');
  const b = +(v[2] || '0').replace(/,/g, '');
  const u = +(v[3] || '0').replace(/,/g, '');
  const rem = +(v[4] || '0').replace(/,/g, '');
  if (!out[org]) out[org] = { repair: { b: 0, u: 0, r: 0 }, maint: { b: 0, u: 0, r: 0 } };
  out[org][type].b += b; out[org][type].u += u; out[org][type].r += rem;
}
const f = n => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let totB = 0, totU = 0, totR = 0;
console.log('| 项目 | 电梯维修及材料(预算/已用/剩余) | 电梯维保合同及年审(预算/已用/剩余) | 电梯合计(预算/已用/剩余) |');
console.log('|------|------|------|------|');
for (const [org, o] of Object.entries(out)) {
  const cb = o.repair.b + o.maint.b, cu = o.repair.u + o.maint.u, cr = o.repair.r + o.maint.r;
  totB += cb; totU += cu; totR += cr;
  console.log('| ' + orgMap[org] + ' | ' + f(o.repair.b) + '/' + f(o.repair.u) + '/' + f(o.repair.r) +
    ' | ' + f(o.maint.b) + '/' + f(o.maint.u) + '/' + f(o.maint.r) +
    ' | **' + f(cb) + '**/**' + f(cu) + '**/**' + f(cr) + '** |');
}
console.log('| **总计** | | | **' + f(totB) + '**/**' + f(totU) + '**/**' + f(totR) + '** |');
