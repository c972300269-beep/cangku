const { chromium } = require('playwright');
const fs = require('fs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
const OUT = 'E:/workbuddy/Claw/reports';

async function safeClose(browser) {
  if (!browser) return;
  try {
    await browser.close().catch(() => {});
  } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

(async () => {
  let browser = null;
  try {
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-extensions', '--disable-background-networking',
      '--disable-sync', '--disable-default-apps',
      '--disable-translate', '--disable-hang-monitor',
      '--disable-prompt-on-repost', '--disable-breakpad',
      '--mute-audio', '--no-pings',
      '--js-flags=--max-old-space-size=512',
    ]
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  console.log('[1] 登录...');
  await page.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  await page.locator('input[placeholder="请输入帐户名或邮箱地址"]').fill('chenjialin3');
  await page.locator('input[placeholder="请输入密码"]').fill('chenjialin');
  await page.locator('button:has-text("登录")').first().click({ timeout: 5000 });
  await sleep(5000);

  console.log('[2] 打开预算明细...');
  await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(8000);

  // Year
  console.log('[3] 选择年份2026...');
  await page.locator('.h-pro-form-item--year input.el-input__inner').first().click({ timeout: 5000 }).catch(() => console.log('  year not found'));
  await sleep(1000);
  for (let i = 0; i < await page.locator('.el-year-table td .cell').count(); i++) {
    if ((await page.locator('.el-year-table td .cell').nth(i).textContent()).trim() === '2026') {
      await page.locator('.el-year-table td .cell').nth(i).click();
      break;
    }
  }
  await sleep(1000);
  console.log('  2026 ✓');

  // Org selection
  console.log('[4] 选择组织...');
  await page.locator('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(4000);
  
  // Force dialog visible
  await page.evaluate(() => {
    const d = document.querySelector('[aria-label="预算组织（个人）"]');
    if (d) { d.style.display = ''; d.style.visibility = 'visible'; d.style.opacity = '1'; }
  });
  await sleep(2000);
  
  for (const org of ORGS) {
    try {
      await page.locator('[aria-label="预算组织（个人）"] .el-tree-node__content').filter({ hasText: org }).first().locator('.el-checkbox__input').first().click({ timeout: 3000 });
      console.log('  ' + org + ' ✓');
    } catch(e) { console.log('  ' + org + ' ✗'); }
    await sleep(300);
  }

  // Confirm org
  await page.evaluate(() => {
    const dlg = document.querySelector('[aria-label="预算组织（个人）"]');
    if (!dlg) return;
    const btns = dlg.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.trim() === '确 定') { b.click(); return; }
    }
  });
  await sleep(2000);
  await page.keyboard.press('Escape');
  await sleep(1000);
  console.log('  确定 ✓');

  // Subject
  console.log('[5] 选择科目13403...');
  await page.locator('.h-pro-form-item--budgetSubject\\.id .ref-icon.el-icon-search, [title="预算科目"] .ref-icon.el-icon-search').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(4000);
  
  await page.evaluate(() => {
    const d = document.querySelector('[aria-label="预算科目"]');
    if (d) { d.style.display = ''; d.style.visibility = 'visible'; d.style.opacity = '1'; }
  });
  await sleep(2000);
  
  await page.locator('[aria-label="预算科目"] input[placeholder="请输入关键字"]').first().fill('13403');
  await page.locator('[aria-label="预算科目"] button[title="查询"]').first().click();
  await sleep(3000);
  
  try {
    await page.locator('[aria-label="预算科目"] .el-tree-node__content').filter({ hasText: '13403' }).first().locator('.el-checkbox__input').first().click({ timeout: 3000 });
    console.log('  13403 ✓');
  } catch(e) { console.log('  13403 ✗'); }

  // Confirm subject
  await page.evaluate(() => {
    const dlg = document.querySelector('[aria-label="预算科目"]');
    if (!dlg) return;
    const btns = dlg.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.trim() === '确 定') { b.click(); return; }
    }
  });
  await sleep(2000);
  await page.evaluate(() => {
    document.querySelectorAll('.el-dialog__wrapper').forEach(w => { w.style.display = 'none'; });
  });
  await sleep(1000);
  console.log('  确定 ✓');

  // Query
  console.log('[6] 查询...');
  const queryBtns = page.locator('.query-inner-op button:has-text("查询"), button:has-text("查 询")').first();
  await queryBtns.click({ timeout: 5000 }).catch(() => console.log('  click failed, trying evaluate'));
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.trim() === '查询' || b.textContent.trim() === '查 询') { b.click(); return; }
    }
  });
  await sleep(10000);

  // Check result
  const rowCount = await page.evaluate(() => {
    const rows = document.querySelectorAll('.el-table__body-wrapper .el-table__row, .el-table__body tbody tr');
    return rows.length;
  });
  console.log('  行数:', rowCount);

  if (rowCount > 0) {
    // Step A: First get the summary rows
    console.log('[7] 汇总数据...');
    const summaryData = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll('.el-table__body tbody tr, .el-table__body-wrapper .el-table__row').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => (td.textContent || '').trim());
        if (cells.some(c => c)) rows.push(cells);
      });
      return rows;
    });

    // Step B: Expand rows with loop (multi-level tree)
    console.log('[8] 展开子目录...');
    let prev = -1, curr = rowCount;
    for (let r = 0; r < 10 && curr !== prev; r++) {
      prev = curr;
      await page.evaluate(() => {
        document.querySelectorAll('.el-table__expand-icon').forEach(i => { try { i.click(); } catch(e) {} });
      });
      await sleep(3000);
      curr = await page.evaluate(() => {
        return document.querySelectorAll('.el-table__body-wrapper .el-table__row, .el-table__body tbody tr').length;
      });
      console.log('  Round ' + (r+1) + ': ' + prev + ' → ' + curr);
    }

    // Extract expanded data WITH indentation for tree level
    const data = await page.evaluate(() => {
      const headers = [];
      const seen = new Set();
      document.querySelectorAll('.el-table__header th').forEach(th => {
        const t = (th.textContent || '').trim();
        if (t && !seen.has(t)) { headers.push(t); seen.add(t); }
      });
      const rows = [];
      document.querySelectorAll('.el-table__body-wrapper .el-table__row').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')];
        // Count el-table__indent spans to determine tree level
        const indentSpans = cells[0].querySelectorAll('.el-table__indent').length;
        const vals = cells.map(td => (td.textContent || '').trim());
        if (vals.some(c => c)) rows.push({indent: indentSpans, vals});
      });
      return { headers, rows };
    });

    // Extract vals only for saving
    const allRows = data.rows.map(r => r.vals);
    console.log('  ' + data.headers.length + '列 x ' + allRows.length + '行');

    // Deduplicate summary rows - use minimum indent as parent level
    const allIndents = data.rows.map(r => r.indent);
    const minIndent = allIndents.length > 0 ? Math.min(...allIndents) : 0;
    const summaryRows = data.rows.filter(r => r.indent === minIndent && r.vals[0] === '设备设施维护支出');
    console.log('  汇总行(设备设施维护支出): ' + summaryRows.length);

    // Deduplicate summary rows
    const seenSet = new Set();
    const cleanRows = [];
    summaryRows.forEach(r => {
      const key = r.vals.slice(0, 5).join('|');
      if (!seenSet.has(key)) { seenSet.add(key); cleanRows.push(r.vals); }
    });

    // Also extract children (indented rows under each parent)
    // Group by org, tracking indent level
    const orgItems = {};
    data.rows.forEach(r => {
      const org = r.vals[1].replace(/.*_/, '');
      if (!orgItems[org]) orgItems[org] = [];
      orgItems[org].push(r);
    });

    // Print tree using parent-child ordering (not grouped by indent level)
    console.log('\n=== 13403 子目录明细 ===\n');
    let totalBudget = 0, totalUsed = 0;
    for (const [org, items] of Object.entries(orgItems)) {
      console.log('【' + org + '】');
      
      // Build tree: track parent stack by indent level
      let parents = []; // stack of {indent, item}
      let printed = new Set();
      
      for (const r of items) {
        if (printed.has(r)) continue;
        printed.add(r);
        
        const indent = r.indent;
        const vals = r.vals;
        
        // Find or create prefix based on indent level
        let prefix = '  ';
        // Track indent stack - items at higher indent are children of last lower-indent item
        // Use direct DOM order: children at indent N belong to last item at indent N-1
        
        // Simple approach: use indent level for prefix
        const indentLevels = [...new Set(items.map(r => r.indent))].sort();
        const levelIdx = indentLevels.indexOf(indent);
        if (levelIdx >= 0) {
          prefix = '  '.repeat(levelIdx + 1);
          if (levelIdx > 0) prefix += '└ ';
        }
        
        const budget = vals[2] || '0';
        const used = vals[3] || '0';
        const remain = vals[4] || '0';
        console.log(prefix + vals[0] + ': 预算=' + budget + ' | 已用=' + used + ' | 剩余=' + remain);
      }
      
      // Calculate org total from the first (lowest indent) item
      if (items.length > 0) {
        const indentLevels = [...new Set(items.map(r => r.indent))].sort();
        const topItems = items.filter(r => r.indent === indentLevels[0]);
        if (topItems.length > 0) {
          const p = topItems[0];
          const b = parseFloat((p.vals[2] || '0').replace(/,/g, '')) || 0;
          const u = parseFloat((p.vals[3] || '0').replace(/,/g, '')) || 0;
          totalBudget += b; totalUsed += u;
        }
      }
      console.log('');
    }
    
    console.log('合计: 预算=' + totalBudget.toLocaleString() + ' | 已用=' + totalUsed.toLocaleString());

    // Save cleaned data - only parent rows (no indent)

    // Save full expanded data (with indent info) and cleaned parent rows
    fs.writeFileSync(OUT + '/budget_latest.json', JSON.stringify({ headers: data.headers, rows: cleanRows }, null, 2));
    fs.writeFileSync(OUT + '/budget_latest_full.json', JSON.stringify({
      headers: data.headers,
      rows: data.rows.map(r => r.vals),
      indentRows: data.rows.map(r => ({indent: r.indent, vals: r.vals}))
    }, null, 2));

    // Quick summary
    const summary = {};
    cleanRows.forEach(r => {
      const org = r[1] || '';
      const budget = parseFloat((r[2] || '0').replace(/,/g, '')) || 0;
      const used = parseFloat((r[3] || '0').replace(/,/g, '')) || 0;
      if (org && (budget > 0 || used > 0)) {
        if (!summary[org]) summary[org] = { budget: 0, used: 0 };
        summary[org].budget += budget;
        summary[org].used += used;
      }
    });

    console.log('\n## 2026年预算 | 科目13403 | ' + cleanRows.length + '行');
    console.log('| 组织 | 年预算 | 已使用 | 剩余 | 使用率 |');
    console.log('|------|--------|--------|------|--------|');
    let gt = 0, gu = 0;
    for (const [org, s] of Object.entries(summary)) {
      const remain = s.budget - s.used;
      const rate = s.budget > 0 ? (s.used / s.budget * 100).toFixed(1) + '%' : '0%';
      console.log('| ' + org + ' | ¥' + s.budget.toLocaleString() + ' | ¥' + s.used.toLocaleString() + ' | ¥' + remain.toLocaleString() + ' | ' + rate + ' |');
      gt += s.budget; gu += s.used;
    }
    if (gt > 0) console.log('| **合计** | **¥' + gt.toLocaleString() + '** | **¥' + gu.toLocaleString() + '** | **¥' + (gt-gu).toLocaleString() + '** | **' + (gu/gt*100).toFixed(1) + '%** |');

    // Generate clean HTML - only key columns: 科目, 组织, 年预算, 年使用, 年剩余, 使用率
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算报告</title>';
    html += '<style>body{font-family:"Microsoft YaHei",Arial;margin:0;padding:20px;background:#f0f2f5}';
    html += '.card{background:#fff;border-radius:8px;padding:20px;margin-bottom:15px;box-shadow:0 1px 3px rgba(0,0,0,.1)}';
    html += 'h1{color:#1a1a2e;margin:0 0 5px 0;font-size:20px}';
    html += '.meta{color:#888;font-size:13px;margin-bottom:15px}';
    html += '.kpi{display:flex;gap:15px;margin-bottom:20px}';
    html += '.kpi-item{flex:1;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:12px 16px;border-radius:8px}';
    html += '.kpi-item.warn{background:linear-gradient(135deg,#f093fb,#f5576c)}';
    html += '.kpi-item .label{font-size:12px;opacity:.8}';
    html += '.kpi-item .value{font-size:22px;font-weight:bold;margin-top:2px}';
    html += 'table{border-collapse:collapse;font-size:13px;width:100%}';
    html += 'th,td{border:1px solid #e8e8e8;padding:8px 10px;text-align:right}';
    html += 'th{background:#fafafa;color:#333;font-weight:600;position:sticky;top:0}';
    html += 'td:first-child,td:nth-child(2){text-align:left}';
    html += 'tr:hover{background:#f5f7ff}';
    html += '.bar{display:inline-block;height:16px;background:#667eea;border-radius:3px;vertical-align:middle}';
    html += '.bar.warn{background:#f5576c}';
    html += '</style></head><body>';

    html += '<div class="card"><h1>2026年预算数据 | 科目13403 设备设施维护支出</h1>';
    html += '<div class="meta">查询时间: ' + new Date().toLocaleString('zh-CN') + ' | 共 ' + cleanRows.length + ' 条明细</div>';

    // KPI cards
    html += '<div class="kpi"><div class="kpi-item">';
    html += '<div class="label">年预算总额</div><div class="value">¥' + (gt + gu).toLocaleString() + '</div></div>';
    html += '<div class="kpi-item warn">';
    html += '<div class="label">年已使用</div><div class="value">¥' + gu.toLocaleString() + '</div></div>';
    html += '<div class="kpi-item">';
    html += '<div class="label">年剩余</div><div class="value">¥' + (gt).toLocaleString() + '</div></div></div>';

    // Summary table
    html += '<table><thead><tr><th>预算组织</th><th>年预算</th><th>年已使用</th><th>年剩余</th></tr></thead><tbody>';
    for (const [org, s] of Object.entries(summary)) {
      const remain = s.budget - s.used;
      html += '<tr><td>' + org + '</td><td>¥' + s.budget.toLocaleString() + '</td><td>¥' + s.used.toLocaleString() + '</td>';
      html += '<td style="color:' + (remain < 0 ? '#f5576c' : '#52c41a') + '">¥' + remain.toLocaleString() + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Monthly detail table - only rows with actual data
    const detailsWithData = cleanRows.filter(r => parseFloat((r[3] || '0').replace(/,/g, '')) > 0);
    if (detailsWithData.length > 0) {
      html += '<div class="card"><h1>月度明细（有支出记录）</h1>';
      html += '<div class="meta">共 ' + detailsWithData.length + ' 条</div>';
      html += '<table><thead><tr><th>科目</th><th>组织</th><th>年预算</th><th>年已使用</th><th>年剩余</th>';
      for (let m = 1; m <= 12; m++) {
        const idx = 4 + (m-1)*3 + 1; // 月已使用列
        html += '<th>' + m + '月使用</th>';
      }
      html += '</tr></thead><tbody>';
      for (const r of detailsWithData) {
        html += '<tr>';
        html += '<td>' + (r[0] || '') + '</td>';
        html += '<td>' + (r[1] || '') + '</td>';
        html += '<td>¥' + (r[2] || '0') + '</td>';
        html += '<td>¥' + (r[3] || '0') + '</td>';
        html += '<td>¥' + (r[4] || '0') + '</td>';
        for (let m = 1; m <= 12; m++) {
          const idx = 4 + (m-1)*3 + 1; // 已使用
          html += '<td>' + (r[idx] || '') + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }

    html += '</body></html>';
    fs.writeFileSync(OUT + '/budget_latest.html', html);
    console.log('\n✓ 报告已生成: reports/budget_latest.html');

    // Screenshot
    console.log('[9] 截图...');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: OUT + '/budget_screenshot.png', fullPage: true });
    console.log('✓ 截图: reports/budget_screenshot.png');
  } else {
    console.log('  ⚠ 查询返回0行');
    await page.screenshot({ path: OUT + '/budget_debug.png' });
    console.log('  截图: reports/budget_debug.png');
  }

  console.log(`\n预算报告生成完毕`);

  } finally {
    await safeClose(browser);
  }
})().catch(e => console.error('FATAL:', e.message, e.stack));
