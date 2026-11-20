# 只读解析 xlsx（zip + 标准库 XML），输出 sheet 名、维度、前若干行，用于确认报表口径
import sys, os, glob, zipfile, re
from xml.etree import ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def read_xlsx(path, max_rows=6, max_cols=20):
    z = zipfile.ZipFile(path)
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall(M + 'si'):
            ss.append(''.join((t.text or '') for t in si.iter(M + 't')))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    names = [s.get('name') for s in wb.iter(M + 'sheet')]
    sheetfiles = sorted(
        [n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)],
        key=lambda n: int(re.search(r'(\d+)\.xml', n).group(1))
    )
    out = []
    for idx, sf in enumerate(sheetfiles):
        name = names[idx] if idx < len(names) else sf
        root = ET.fromstring(z.read(sf))
        dim = root.find(M + 'dimension')
        rows = []
        for row in root.iter(M + 'row'):
            r = int(row.get('r', '0'))
            if r > max_rows:
                break
            vals = []
            for c in list(row)[:max_cols]:
                t = c.get('t')
                v = c.find(M + 'v')
                isel = c.find(M + 'is')
                if t == 's' and v is not None:
                    val = ss[int(v.text)] if v.text and int(v.text) < len(ss) else ''
                elif t == 'inlineStr' and isel is not None:
                    val = ''.join((x.text or '') for x in isel.iter(M + 't'))
                elif v is not None:
                    val = v.text or ''
                else:
                    val = ''
                vals.append(str(val)[:26])
            rows.append((r, vals))
        out.append((name, dim.get('ref') if dim is not None else '?', rows))
    z.close()
    return out

if __name__ == '__main__':
    d = sys.argv[1] if len(sys.argv) > 1 else r'C:/Users/CHENJI~1/AppData/Local/Temp/workbuddy-weixin-media/inbound'
    fs = sorted(glob.glob(os.path.join(d, '*.xlsx')))
    print('文件数 =', len(fs))
    for f in fs:
        print('\n=== ' + os.path.basename(f) + ' | ' + str(round(os.path.getsize(f) / 1024, 1)) + ' KB ===')
        try:
            for name, dim, rows in read_xlsx(f):
                print('  sheet: ' + name + ' | 维度 ' + dim)
                for r, vals in rows:
                    print('   r' + str(r) + ': ' + repr(vals))
        except Exception as e:
            print('  ERR', type(e).__name__, e)
