const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('E:/workbuddy/2026-07-15-09-18-53/budget_report.html', 'utf-8');
const dom = new JSDOM(html);
const doc = dom.window.document;

// Parse number
function num(s) { return parseFloat((s || '0').replace(/,/g, '')) || 0; }
function fmt(n) { return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Get all h2 sections
const h2s = doc.querySelectorAll('h2');
const summaries = [];

h2s.forEach(h2 => {
  const orgName = h2.textContent.trim();
  const table = h2.nextElementSibling?.querySelector('table');
  if (!table) return;
  
  const trs = table.querySelectorAll('tbody tr');
  let annBudget = 0, annUsed = 0, annRemain = 0;
  const monthly = {};
  const items = [];
  
  trs.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 5) return;
    
    const name = tds[0]?.textContent?.trim() || '';
    const nb = num(tds[2]?.textContent); // annual budget
    const nu = num(tds[3]?.textContent); // annual used  
    const nr = num(tds[4]?.textContent); // annual remain
    
    annBudget += nb;
    annUsed += nu;
    annRemain += nr;
    
    // Monthly data starts at index 5, every 3 columns (budget, used, remain)
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    months.forEach((m, i) => {
      const col = 5 + i * 3;
      if (!monthly[m]) monthly[m] = { budget: 0, used: 0, remain: 0 };
      monthly[m].budget += num(tds[col]?.textContent);
      monthly[m].used += num(tds[col + 1]?.textContent);
      monthly[m].remain += num(tds[col + 2]?.textContent);
    });
    
    items.push({ name, budget: nb, used: nu, remain: nr });
  });
  
  summaries.push({ orgName, annBudget, annUsed, annRemain, monthly, items });
});

// Output summary
console.log('='.repeat(70));
console.log('  2026年预算数据汇总 - 科目13403 设备设施维护支出');
console.log('='.repeat(70));

// Per-org summary
summaries.forEach(s => {
  const pct = s.annBudget > 0 ? ((s.annUsed / s.annBudget) * 100).toFixed(1) : '0';
  console.log(`\n## ${s.orgName}`);
  console.log(`  年预算: ¥${fmt(s.annBudget)} | 已用: ¥${fmt(s.annUsed)} | 剩余: ¥${fmt(s.annRemain)} | 使用率: ${pct}%`);
  
  // Monthly table
  console.log(`  月份     预算数        已使用        剩余预算      使用率`);
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  months.forEach(m => {
    const d = s.monthly[m];
    if (!d || d.budget === 0) return;
    const mpct = d.budget > 0 ? ((d.used / d.budget) * 100).toFixed(1) : '0';
    const flag = parseFloat(mpct) > 100 ? ' ⚠超标' : '';
    console.log(`  ${m.padEnd(4)} ¥${fmt(d.budget).padStart(12)}  ¥${fmt(d.used).padStart(12)}  ¥${fmt(d.remain).padStart(12)}  ${mpct}%${flag}`);
  });
  
  // Item breakdown
  console.log(`  明细项:`);
  s.items.forEach(it => console.log(`    ${it.name.padEnd(25)} 预算: ¥${fmt(it.budget).padStart(12)}  已用: ¥${fmt(it.used).padStart(12)}  剩余: ¥${fmt(it.remain).padStart(12)}`));
});

// Grand total
const totalBudget = summaries.reduce((a,s) => a + s.annBudget, 0);
const totalUsed = summaries.reduce((a,s) => a + s.annUsed, 0);
const totalRemain = summaries.reduce((a,s) => a + s.annRemain, 0);
const totalPct = totalBudget > 0 ? ((totalUsed / totalBudget) * 100).toFixed(1) : '0';

console.log('\n' + '='.repeat(70));
console.log(`  全部合计: 预算 ¥${fmt(totalBudget)} | 已用 ¥${fmt(totalUsed)} | 剩余 ¥${fmt(totalRemain)} | 使用率 ${totalPct}%`);
console.log('='.repeat(70));
