const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('E:/workbuddy/2026-07-15-09-18-53/budget_report.html', 'utf-8');
const dom = new JSDOM(html);
const doc = dom.window.document;

// Parse all rows
const rows = [];
const rowEls = doc.querySelectorAll('tr');
const headerCells = rowEls[0] ? rowEls[0].querySelectorAll('th, td') : [];

rowEls.forEach((tr, idx) => {
  const cells = tr.querySelectorAll('td, th');
  if (cells.length === 0) return;
  const rowData = [];
  cells.forEach(td => {
    rowData.push(td.textContent.trim());
  });
  if (rowData.length > 0 && rowData.some(c => c)) {
    rows.push(rowData);
  }
});

console.log(`Total rows (including header): ${rows.length}`);

// Output full CSV
const header = rows[0].join('\t');
console.log('\n=== HEADER ===');
console.log(header);
console.log('\n=== DATA (tab-separated) ===');
for (let i = 1; i < rows.length; i++) {
  console.log(rows[i].join('\t'));
}

// Summary by org
console.log('\n=== SUMMARY BY ORG ===');
const orgMap = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const orgIdx = 0;
  const budgetIdx = rows[0].findIndex(h => h.includes('预算') || h.includes('年'));
  const usedIdx = rows[0].findIndex(h => h.includes('已') || h.includes('使用') || h.includes('实际'));
  
  const org = r[orgIdx] || '未知';
  if (!orgMap[org]) orgMap[org] = { budget: 0, used: 0, count: 0 };
  orgMap[org].count++;
}

for (const [org, info] of Object.entries(orgMap)) {
  console.log(`${org}: ${info.count} rows`);
}
