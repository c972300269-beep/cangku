const fs = require('fs');
const path = require('path');

const data = fs.readFileSync(
  'E:/workbuddy/Claw/.workbuddy/bpm_output/my_applying_requests.json',
  'utf-8'
);

// Clean new Date() format
const clean = data.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (m, y, mo, d, h, mi, s) => {
  const date = new Date(+y, +mo, +d, +h, +mi, +s);
  return '"' + date.toISOString() + '"';
});

const json = JSON.parse(clean);
const items = json.children || [];

console.log(`Total: ${items.length}`);

// Categorize
const cats = {};
items.forEach(item => {
  const children = item.State?.children || [];
  const node = children.length > 0 ? children[0].StepName : '未知';
  const handler = children.length > 0 ? children[0].RecipientDisplayName || '' : '';
  if (!cats[node]) cats[node] = { count: 0, items: [], handler };
  cats[node].count++;
  cats[node].items.push(item);
});

let md = '## BPM流程概览 — "我发起的流程"审批中\n\n';
md += `**总条数：${items.length}条**\n\n`;

md += '### 按当前节点分类\n\n';
md += '| 节点 | 数量 | 关键信息 |\n';
md += '|------|------|----------|\n';

const sorted = Object.entries(cats).sort((a, b) => b[1].count - a[1].count);
sorted.forEach(([node, cat]) => {
  const first = cat.items[0].CreateAt;
  const last = cat.items[cat.items.length - 1].CreateAt;
  const range = first && last ? `${last.substring(0, 7)} ~ ${first.substring(0, 10)}` : '';
  const emoji = node.includes('发起人') || node.includes('送件') ? ' ⚠️' : '';
  md += `| ${node}${emoji} | ${cat.count}条 | ${cat.handler}处理中，${range} |\n`;
});

// Recent 7 days
const cutoff = new Date(Date.now() - 7 * 86400000);
const recent = items.filter(i => new Date(i.CreateAt) > cutoff).sort((a, b) => new Date(b.CreateAt) - new Date(a.CreateAt));

md += '\n### 最近7天新增（需关注）\n\n';
md += '| 流水号 | 流程类型 | 描述 | 当前节点 |\n';
md += '|--------|----------|------|----------|\n';

recent.forEach(item => {
  const node = (item.State?.children || [{}])[0].StepName || '';
  const handler = (item.State?.children || [{}])[0].RecipientDisplayName || '';
  const warn = (node.includes('发起人') || node.includes('送件')) ? ' ⚠️' : '';
  md += `| ${item.SerialNum}${warn} | ${item.ProcessName} | ${item.Description} | ${node}（${handler}） |\n`;
});

// Manual action needed
const manual = items.filter(i => {
  const node = (i.State?.children || [{}])[0].StepName || '';
  return node.includes('发起人') || node.includes('送件');
});
manual.forEach(w => {
  md += `\n> ⚠️ **${w.SerialNum}** 卡在"${(w.State?.children || [{}])[0].StepName}"节点，需要进入系统手动推进。`;
});

// Old items
const old = items.filter(i => new Date(i.CreateAt) < new Date('2025-11-01'));
if (old.length > 0) {
  md += `\n\n> 📌 ${old.length}条超半年老流程（最早${old[old.length-1].CreateAt?.substring(0, 10) || '?'}），建议确认可否撤回。`;
}

console.log(md);
fs.writeFileSync('E:/workbuddy/Claw/reports/bpm_summary.md', md);
console.log('\nSaved: reports/bpm_summary.md');
