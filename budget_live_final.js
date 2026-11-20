const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
const ACCOUNT = '13403';

function wait(page, ms = 1500) { return page.waitForTimeout(ms); }

(async () => {
  console.log('[0] 启动浏览器...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080']
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  try {
    // Step 1: Login
    console.log('[1] 登录...');
    await page.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(page, 8000);
    // Debug: what page did we get?
    await page.screenshot({ path: path.join(OUT, 'login_debug.png') });
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'EMPTY');
    console.log('  Page body:', bodyText);
    await page.locator('input[placeholder="请输入帐户名或邮箱地址"]').fill('chenjialin3');
    await page.locator('input[placeholder="请输入密码"]').fill('chenjialin');
    await page.locator('button:has-text("登录")').first().click();
    await wait(page, 5000);
    console.log('  ✓ 登录完成');

    // Step 2: Navigate to budget detail page
    console.log('[2] 进入预算明细...');
    await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(page, 8000);
    console.log('  ✓ 页面加载完成');

    // Step 3: Set year = 2026
    console.log('[3] 选择年份2026...');
    await page.locator('.h-pro-form-item--year input.el-input__inner').first().click();
    await wait(page, 1000);
    const yearCells = page.locator('.el-year-table td .cell');
    for (let i = 0; i < await yearCells.count(); i++) {
      if ((await yearCells.nth(i).textContent()).trim() === '2026') {
        await yearCells.nth(i).click();
        break;
      }
    }
    await wait(page, 1500);
    console.log('  ✓ 2026');

    // Step 4: Select budget orgs
    console.log('[4] 选择预算组织...');
    await page.locator('.h-pro-form-item--budgetOrg\\.id .ref-icon.el-icon-search').first().click();
    await wait(page, 4000);
    
    const orgDialog = page.locator('[aria-label="预算组织（个人）"]').first();
    await orgDialog.locator('.el-tree-node__content').first().waitFor({ state: 'visible', timeout: 20000 });
    await wait(page, 1500);

    for (const org of ORGS) {
      const nodes = orgDialog.locator('.el-tree-node__content');
      for (let i = 0; i < await nodes.count(); i++) {
        if ((await nodes.nth(i).textContent()).includes(org)) {
          await nodes.nth(i).locator('.el-checkbox__input').first().click();
          await wait(page, 200);
          console.log(`  ${org}: ✓`);
          break;
        }
      }
    }

    // Confirm org dialog
    const orgButtons = orgDialog.locator('button');
    for (let i = 0; i < await orgButtons.count(); i++) {
      if ((await orgButtons.nth(i).textContent()).trim() === '确 定') {
        await orgButtons.nth(i).click();
        break;
      }
    }
    await wait(page, 2000);
    await page.keyboard.press('Escape');
    await wait(page, 1000);

    // Step 5: Select budget subject
    console.log('[5] 选择预算科目...');
    await page.locator('.h-pro-form-item--budgetSubject\\.id .ref-icon.el-icon-search, .h-pro-form-item[title="预算科目"] .ref-icon.el-icon-search').first().click();
    await wait(page, 4000);
    
    const subDialog = page.locator('[aria-label="预算科目"]').first();
    await subDialog.locator('.el-tree-node__content').first().waitFor({ state: 'visible', timeout: 20000 });
    await wait(page, 1500);
    
    // Search for 13403
    await subDialog.locator('input[placeholder="请输入关键字"]').first().fill(ACCOUNT);
    await wait(page, 500);
    await subDialog.locator('button[title="查询"]').click();
    await wait(page, 3000);
    
    const subNodes = subDialog.locator('.el-tree-node__content');
    for (let i = 0; i < await subNodes.count(); i++) {
      if ((await subNodes.nth(i).textContent()).includes(ACCOUNT)) {
        await subNodes.nth(i).locator('.el-checkbox__input').first().click();
        console.log(`  ${ACCOUNT}: ✓`);
        break;
      }
    }
    
    const subButtons = subDialog.locator('button');
    for (let i = 0; i < await subButtons.count(); i++) {
      if ((await subButtons.nth(i).textContent()).trim() === '确 定') {
        await subButtons.nth(i).click();
        break;
      }
    }
    await wait(page, 2000);
    await page.keyboard.press('Escape');
    await wait(page, 1000);

    // Step 6: Query!
    console.log('[6] 查询...');
    await page.locator('.query-inner-op button:has-text("查询")').first().click();
    await wait(page, 10000);
    console.log('  ✓ 查询已触发');

    // Step 7: Expand all rows
    console.log('[7] 展开数据...');
    let prev = -1, curr = 0, round = 0;
    while (round < 10) {
      round++;
      prev = curr;
      
      await page.evaluate(() => {
        document.querySelectorAll('.el-table__expand-icon').forEach(icon => { try { icon.click() } catch(e) {} });
        document.querySelectorAll('.el-table__row .el-table__expand-column .cell').forEach(cell => { try { cell.click() } catch(e) {} });
        document.querySelectorAll('.el-table').forEach(table => {
          if (table.__vue__ && table.__vue__.store) {
            (table.__vue__.store.states.data || []).forEach(row => {
              try { table.__vue__.toggleRowExpansion(row, true) } catch(e) {}
            });
          }
        });
      });
      await wait(page, 3000);
      curr = await page.evaluate(() => document.querySelectorAll('.el-table__body tbody tr').length);
      console.log(`  Round ${round}: ${prev} → ${curr}`);
      if (curr === prev) break;
    }
    console.log(`  ✓ 最终 ${curr} 行`);

    // Step 8: Extract data
    console.log('[8] 提取数据...');
    const tableData = await page.evaluate(() => {
      const headers = [];
      document.querySelectorAll('.el-table__header th').forEach(th => {
        const text = th.textContent.trim();
        if (text) headers.push(text);
      });
      
      const rows = [];
      document.querySelectorAll('.el-table__body tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        const row = [];
        cells.forEach(td => {
          row.push(td.textContent.trim());
        });
        if (row.some(c => c)) rows.push(row);
      });
      
      return { headers, rows };
    });
    
    console.log(`  表头: ${tableData.headers.length} 列`);
    console.log(`  数据: ${tableData.rows.length} 行`);

    // Step 9: Generate JSON
    const jsonPath = path.join(OUT, 'budget_live_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(tableData, null, 2));
    console.log(`  ✓ JSON: ${jsonPath}`);

    // Step 10: Generate HTML report
    console.log('[9] 生成HTML报告...');
    const { headers, rows } = tableData;
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>2026年预算数据报告</title>
<style>
body{font-family:Arial;margin:20px;background:#f5f5f5}
h1{color:#333}
.summary{background:#fff;padding:12px 20px;margin:15px 0;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
table{border-collapse:collapse;width:100%;font-size:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1)}
th,td{border:1px solid #e0e0e0;padding:6px 8px;text-align:right;white-space:nowrap}
th{background:#4472C4;color:#fff;position:sticky;top:0;z-index:1}
td:first-child,td:nth-child(2){text-align:left}
tr:hover{background:#f0f7ff}
tr:nth-child(even){background:#fafafa}
tr:nth-child(even):hover{background:#f0f7ff}
</style></head><body>
<h1>2026年预算数据报告</h1>
<div class="summary"><strong>科目: 13403-设备设施维护支出</strong> | 年份:2026 | 4个组织 | ${rows.length}行</div>
<table><thead><tr>`;

    for (const h of headers) {
      html += `<th>${h}</th>`;
    }
    html += '</tr></thead><tbody>';
    
    for (const row of rows) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${cell}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></body></html>';
    
    const htmlPath = path.join(OUT, 'budget_live_report.html');
    fs.writeFileSync(htmlPath, html);
    console.log(`  ✓ HTML: ${htmlPath}`);

    // Step 11: Generate Excel
    console.log('[10] 生成Excel...');
    await generateXlsx(headers, rows);

    // Step 12: Take screenshot
    console.log('[11] 截图...');
    await page.screenshot({ path: path.join(OUT, 'budget_live_screenshot.png'), fullPage: true });
    console.log('  ✓ 截图完成');

  } catch (error) {
    console.error('Error:', error.message);
    try { await page.screenshot({ path: path.join(OUT, 'budget_error.png') }); } catch(e) {}
  } finally {
    await browser.close();
    console.log('\n全部完成!');
  }
})();

async function generateXlsx(headers, rows) {
  // Use the XML template approach from minimax-xlsx
  const { execSync } = require('child_process');
  const skillDir = 'C:/Users/chenjialin3/.workbuddy/skills/skill_2053082401071824896';
  const workDir = 'C:/Users/chenjialin3/AppData/Local/Temp/xlsx_budget2';
  const pythonExe = 'C:/Users/chenjialin3/.workbuddy/binaries/python/versions/3.13.12/python.exe';
  
  // Clean and copy template
  if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
  execSync(`cp -r "${skillDir}/templates/minimal_xlsx/" "${workDir}/"`, { shell: 'bash' });
  
  // Write the build script
  const buildScript = `
import os, sys
WORK_DIR = r'${workDir}'
OUT = r'${path.join(OUT, 'budget_live_data.xlsx').replace(/\\/g, '\\\\')}'
headers = ${JSON.stringify(headers)}
rows = ${JSON.stringify(rows)}

# Build shared strings
strings = []
def add(s):
    s = str(s)
    if s not in strings:
        strings.append(s)
    return strings.index(s)

for h in headers:
    add(h)
for row in rows:
    for cell in row:
        add(str(cell))

add('2026年预算数据 - 科目13403')

def col_letter(n):
    result = ''
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result

# Sheet data
d = []
d.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
d.append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">')
d.append('  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
d.append('  <sheetFormatPr defaultRowHeight="15"/>')
d.append('  <cols>')
for ci in range(1, len(headers) + 1):
    w = 28 if ci <= 2 else 14
    d.append(f'    <col min="{ci}" max="{ci}" width="{w}" customWidth="1"/>')
d.append('  </cols>')
d.append('  <sheetData>')

# Header
d.append('    <row r="1" ht="20" customHeight="1">')
for ci, h in enumerate(headers):
    cl = col_letter(ci + 1)
    si = add(h)
    d.append(f'      <c r="{cl}1" t="s" s="4"><v>{si}</v></c>')
d.append('    </row>')

# Data
for ri, row in enumerate(rows):
    rn = ri + 2
    d.append(f'    <row r="{rn}">')
    for ci, cell in enumerate(row):
        cl = col_letter(ci + 1)
        # Try as number
        try:
            v = float(str(cell).replace(',', ''))
            d.append(f'      <c r="{cl}{rn}" s="10"><v>{v}</v></c>')
        except:
            si = add(str(cell))
            d.append(f'      <c r="{cl}{rn}" t="s" s="0"><v>{si}</v></c>')
    d.append(f'    </row>')

d.append('  </sheetData>')
d.append('  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>')
d.append('</worksheet>')

with open(os.path.join(WORK_DIR, 'xl', 'worksheets', 'sheet1.xml'), 'w', encoding='utf-8') as f:
    f.write('\\n'.join(d))

# sharedStrings
ss = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
ss.append(f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}" uniqueCount="{len(strings)}">')
for s in strings:
    s_esc = str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    ss.append(f'  <si><t>{s_esc}</t></si>')
ss.append('</sst>')
with open(os.path.join(WORK_DIR, 'xl', 'sharedStrings.xml'), 'w', encoding='utf-8') as f:
    f.write('\\n'.join(ss))

# workbook.xml - rename sheet
wb = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="明细" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="162913"/></workbook>'''
with open(os.path.join(WORK_DIR, 'xl', 'workbook.xml'), 'w', encoding='utf-8') as f:
    f.write(wb)

print(f'Done: {len(strings)} strings, {len(rows)} rows')
`;

  const buildPath = path.join(workDir, '..', 'build_xlsx2.py');
  fs.writeFileSync(buildPath, buildScript);
  
  execSync(`"${pythonExe}" "${buildPath}"`, { encoding: 'utf-8' });
  
  // Pack
  execSync(`"${pythonExe}" "${skillDir}/scripts/xlsx_pack.py" "${workDir}/" "${path.join(OUT, 'budget_live_data.xlsx')}"`, { encoding: 'utf-8' });
  
  console.log('  ✓ Excel生成完成');
}
