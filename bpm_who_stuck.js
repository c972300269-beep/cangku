const fs = require('fs');
const path = require('path');

const file = 'E:/workbuddy/Claw/.workbuddy/bpm_output/my_applying_requests.json';
let raw = fs.readFileSync(file, 'utf8');
// 处理 new Date(...) 格式
raw = raw.replace(/new Date\(([^)]+)\)/g, (m, args) => {
  const parts = args.split(',').map(p => parseInt(p.trim()));
  if (parts.length >= 3) {
    const d = new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
    return JSON.stringify(d.toISOString());
  }
  return 'null';
});
const data = JSON.parse(raw);
const items = data.children || [];

// 按 "节点 @ 处理人" 分组
const groups = {};
for (const it of items) {
  const sn = it.SerialNum || '';
  const pname = it.ProcessName || '';
  const desc = (it.Description || '').replace(/<br\/>/g, ' / ');
  const created = (it.CreateAt || '').slice(0, 10);
  const state = it.State || {};
  const steps = (state.children || []).map(s => ({
    step: s.StepName || '',
    name: s.RecipientDisplayName || '',
    account: s.RecipientAccount || ''
  }));
  // 用首个 step 作为主节点（会签则并列）
  const keyParts = steps.map(s => `${s.step}@${s.name}(${s.account})`);
  const key = keyParts.join(' + ');
  if (!groups[key]) groups[key] = { count: 0, stepName: steps.map(s=>s.step).join('/'), handler: steps.map(s=>`${s.name}`).join('/'), items: [] };
  groups[key].count++;
  groups[key].items.push({ sn, pname, desc, created });
}

const fmtDate = it => it.created;

console.log(`## 我发起的流程·审批中 — 当前卡在谁手上
**总条数：${items.length} 条**
`);

console.log(`### 按「当前节点 / 处理人」分组
`);
console.log(`| 序号 | 当前节点 | 处理人 | 数量 | 涉及流程类型 |`);
console.log(`|------|---------|--------|------|------------|`);
let idx = 0;
const order = Object.entries(groups).sort((a,b)=>b[1].count-a[1].count);
for (const [key, g] of order) {
  idx++;
  const types = [...new Set(g.items.map(i=>i.pname))].join('、');
  console.log(`| ${idx} | ${g.stepName} | ${g.handler} | **${g.count}** | ${types} |`);
}

console.log(`\n### 明细
`);
for (const [key, g] of order) {
  console.log(`\n**▌ ${g.stepName} → ${g.handler}（${g.count}条）**\n`);
  console.log(`| 流水号 | 流程类型 | 创建日期 | 描述 |`);
  console.log(`|--------|---------|---------|------|`);
  for (const it of g.items) {
    console.log(`| ${it.sn} | ${it.pname} | ${it.created} | ${it.desc.slice(0,60)} |`);
  }
}
