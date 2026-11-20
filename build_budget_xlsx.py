#!/usr/bin/env python3
"""Parse budget HTML and build xlsx XML files."""
import os, sys

HTML_PATH = r"E:\workbuddy\2026-07-15-09-18-53\budget_report.html"
WORK_DIR = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Temp', 'xlsx_budget')
if not os.path.isdir(WORK_DIR):
    # Fallback - find it
    import glob
    for d in glob.glob(r'C:\Users\*\AppData\Local\Temp\xlsx_budget'):
        WORK_DIR = d
        break
    if not os.path.isdir(WORK_DIR):
        print(f"ERROR: Work dir not found at {WORK_DIR}")
        sys.exit(1)

print(f"Work dir: {WORK_DIR}")

from html.parser import HTMLParser

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_td = False
        self.current_row = []
        self.rows = []
        self.current_text = ""
        
    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.current_row = []
        elif tag in ('td', 'th'):
            self.in_td = True
            self.current_text = ""
            
    def handle_endtag(self, tag):
        if tag in ('td', 'th'):
            self.in_td = False
            self.current_row.append(self.current_text.strip())
        elif tag == 'tr':
            if self.current_row:
                self.rows.append(self.current_row)
                
    def handle_data(self, data):
        if self.in_td:
            self.current_text += data

# Parse HTML
with open(HTML_PATH, 'r', encoding='utf-8') as f:
    html = f.read()
parser = TableParser()
parser.feed(html)

rows = parser.rows
print(f"Parsed {len(rows)} rows")

# Deduplicate
data_rows = []
for i, r in enumerate(rows):
    if i == 0:
        continue
    if r[0] == '预算科目' and len(r) > 1 and r[1] == '预算组织':
        continue
    if not r or not any(c for c in r):
        continue
    data_rows.append(r)

print(f"Data rows after dedup: {len(data_rows)}")

# Org order
orgs_order = []
org_rows_map = {}
for r in data_rows:
    org = r[1] if len(r) > 1 else ''
    if org not in org_rows_map:
        org_rows_map[org] = []
        orgs_order.append(org)
    org_rows_map[org].append(r)

# Column defs
detail_cols = ["预算科目", "预算组织", "年预算数", "年已使用", "年剩余预算"]
for m in range(1, 13):
    detail_cols.extend([f"{m}月预算", f"{m}月已使用", f"{m}月剩余"])

# Shared strings
strings = []
string_idx = {}

def add_string(s):
    s = str(s)
    if s not in string_idx:
        string_idx[s] = len(strings)
        strings.append(s)
    return string_idx[s]

for col in detail_cols:
    add_string(col)
for r in data_rows:
    if len(r) >= 1: add_string(r[0])
    if len(r) >= 2: add_string(r[1])

add_string("2026年预算数据汇总")
add_string("科目：13403-设备设施维护支出 | 4个组织 | 186行")
add_string("组织")
add_string("年预算(元)")
add_string("年已使用(元)")
add_string("年剩余(元)")
add_string("使用率")
add_string("合计")

print(f"Shared strings: {len(strings)}")

def col_letter(n):
    result = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result

def xml_escape(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def num_val(v):
    if not v: return None
    try: return float(str(v).replace(',', ''))
    except: return None

# Write sharedStrings.xml
ss_parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
ss_parts.append(f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}" uniqueCount="{len(strings)}">')
for s in strings:
    ss_parts.append(f'  <si><t>{xml_escape(s)}</t></si>')
ss_parts.append('</sst>')

with open(os.path.join(WORK_DIR, 'xl', 'sharedStrings.xml'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(ss_parts))
print("sharedStrings.xml done")

# Write Sheet1 (明细)
d = []
d.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
d.append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">')
d.append('  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
d.append('  <sheetFormatPr defaultRowHeight="15"/>')
d.append('  <cols>')
d.append('    <col min="1" max="1" width="32" customWidth="1"/>')
d.append('    <col min="2" max="2" width="30" customWidth="1"/>')
for c in range(3, 42):
    d.append(f'    <col min="{c}" max="{c}" width="12" customWidth="1"/>')
d.append('  </cols>')
d.append('  <sheetData>')

# Header
d.append('    <row r="1" ht="20" customHeight="1">')
for ci, col_name in enumerate(detail_cols):
    cl = col_letter(ci + 1)
    d.append(f'      <c r="{cl}1" t="s" s="4"><v>{string_idx[col_name]}</v></c>')
d.append('    </row>')

# Data
for ri, row in enumerate(data_rows):
    r_num = ri + 2
    d.append(f'    <row r="{r_num}">')
    cat = row[0] if len(row) > 0 else ''
    d.append(f'      <c r="A{r_num}" t="s" s="0"><v>{string_idx.get(cat, 0)}</v></c>')
    org = row[1] if len(row) > 1 else ''
    d.append(f'      <c r="B{r_num}" t="s" s="0"><v>{string_idx.get(org, 0)}</v></c>')
    for ci in range(2, min(len(row), 41)):
        val = num_val(row[ci])
        if val is not None:
            cl = col_letter(ci + 1)
            d.append(f'      <c r="{cl}{r_num}" s="10"><v>{val}</v></c>')
    d.append(f'    </row>')

d.append('  </sheetData>')
d.append('  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>')
d.append('</worksheet>')

with open(os.path.join(WORK_DIR, 'xl', 'worksheets', 'sheet1.xml'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(d))
print("sheet1.xml done")

# Write Sheet2 (汇总)
# Get org totals from "设备设施维护支出" rows
org_summary = {}
for r in data_rows:
    cat = r[0] if len(r) > 0 else ''
    org = r[1] if len(r) > 1 else ''
    if cat == '设备设施维护支出':
        b_val = num_val(r[2]) if len(r) > 2 else 0
        u_val = num_val(r[3]) if len(r) > 3 else 0
        r_val = num_val(r[4]) if len(r) > 4 else 0
        if org and org not in org_summary:
            org_summary[org] = (b_val or 0, u_val or 0, r_val or 0)

s = []
s.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
s.append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">')
s.append('  <sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
s.append('  <sheetFormatPr defaultRowHeight="15"/>')
s.append('  <cols>')
s.append('    <col min="1" max="1" width="34" customWidth="1"/>')
s.append('    <col min="2" max="4" width="18" customWidth="1"/>')
s.append('    <col min="5" max="5" width="10" customWidth="1"/>')
s.append('  </cols>')
s.append('  <sheetData>')

s.append(f'    <row r="1" ht="22" customHeight="1"><c r="A1" t="s" s="4"><v>{string_idx["2026年预算数据汇总"]}</v></c></row>')
s.append(f'    <row r="2" ht="16" customHeight="1"><c r="A2" t="s" s="0"><v>{string_idx["科目：13403-设备设施维护支出 | 4个组织 | 186行"]}</v></c></row>')

o_si = string_idx["组织"]
b_si = string_idx["年预算(元)"]
u_si = string_idx["年已使用(元)"]
r_si = string_idx["年剩余(元)"]
p_si = string_idx["使用率"]
s.append(f'    <row r="3" ht="18" customHeight="1">')
for ci, si in enumerate([o_si, b_si, u_si, r_si, p_si]):
    cl = col_letter(ci + 1)
    s.append(f'      <c r="{cl}3" t="s" s="4"><v>{si}</v></c>')
s.append('    </row>')

row_num = 4
for org in orgs_order:
    if org in org_summary:
        bv, uv, rv = org_summary[org]
        org_si = string_idx.get(org, 0)
        s.append(f'    <row r="{row_num}">')
        s.append(f'      <c r="A{row_num}" t="s" s="0"><v>{org_si}</v></c>')
        s.append(f'      <c r="B{row_num}" s="5"><v>{bv}</v></c>')
        s.append(f'      <c r="C{row_num}" s="5"><v>{uv}</v></c>')
        s.append(f'      <c r="D{row_num}" s="5"><v>{rv}</v></c>')
        s.append(f'      <c r="E{row_num}" s="8"><f>IF(B{row_num}=0,0,C{row_num}/B{row_num})</f><v></v></c>')
        s.append(f'    </row>')
        row_num += 1

# Total
t_si = string_idx["合计"]
last_data = row_num - 1
s.append(f'    <row r="{row_num}" ht="16" customHeight="1">')
s.append(f'      <c r="A{row_num}" t="s" s="4"><v>{t_si}</v></c>')
s.append(f'      <c r="B{row_num}" s="6"><f>SUM(B4:B{last_data})</f><v></v></c>')
s.append(f'      <c r="C{row_num}" s="6"><f>SUM(C4:C{last_data})</f><v></v></c>')
s.append(f'      <c r="D{row_num}" s="6"><f>SUM(D4:D{last_data})</f><v></v></c>')
s.append(f'      <c r="E{row_num}" s="8"><f>IF(B{row_num}=0,0,C{row_num}/B{row_num})</f><v></v></c>')
s.append(f'    </row>')

s.append('  </sheetData>')
s.append('  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>')
s.append('</worksheet>')

with open(os.path.join(WORK_DIR, 'xl', 'worksheets', 'sheet2.xml'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(s))
print("sheet2.xml done")

# Config files
configs = {
    os.path.join(WORK_DIR, 'xl', 'workbook.xml'): '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="明细" sheetId="1" r:id="rId1"/>
    <sheet name="汇总" sheetId="2" r:id="rId4"/>
  </sheets>
  <calcPr calcId="162913" fullCalcOnLoad="1"/>
</workbook>''',
    os.path.join(WORK_DIR, 'xl', '_rels', 'workbook.xml.rels'): '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>''',
    os.path.join(WORK_DIR, '[Content_Types].xml'): '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>''',
}

for fpath, content in configs.items():
    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Written: {os.path.basename(fpath)}")

print(f"\nBUILD COMPLETE: {len(data_rows)} rows, {len(orgs_order)} orgs, {len(strings)} strings")
