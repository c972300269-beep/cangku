import os, re, sys
import zipfile

BASE = r'E:\workbuddy\Claw\reports\repair_fund\提取 紧急'

def read_docx(path):
    try:
        import docx
        d = docx.Document(path)
        paras = [p.text for p in d.paragraphs if p.text.strip()]
        # tables
        tbl = []
        for t in d.tables:
            for row in t.rows:
                tbl.append(' | '.join(c.text.strip() for c in row.cells))
        return '\n'.join(paras + tbl)
    except Exception as e:
        return '[docx err] ' + str(e)

def read_doc_raw(path):
    # extract chinese text runs from OLE2 .doc binary
    data = open(path, 'rb').read()
    out = []
    # try utf-16-le runs (common in .doc)
    for enc in ['utf-16-le', 'gb18030', 'gbk']:
        try:
            txt = data.decode(enc, errors='ignore')
            runs = re.findall(r'[\u4e00-\u9fff][\u4e00-\u9fff\w\s、，。：；（）()\-\.0-9\/]{2,}', txt)
            if len(runs) > 5:
                # dedupe preserve order
                seen=set(); res=[]
                for r in runs:
                    r=r.strip()
                    if r not in seen and len(r)>2:
                        seen.add(r); res.append(r)
                return '\n'.join(res)
        except Exception:
            pass
    return '[doc raw: no chinese runs]'

def read_xls(path):
    try:
        import xlrd
        wb = xlrd.open_workbook(path)
        lines=[]
        for ws in wb.sheets():
            for r in range(ws.nrows):
                cells=[str(ws.cell_value(r,c)).strip() for c in range(ws.ncols)]
                cells=[c for c in cells if c and c.lower()!='none']
                if cells: lines.append(' | '.join(cells))
        return '\n'.join(lines)
    except Exception as e:
        return '[xls err] '+str(e)

files = sorted(os.listdir(BASE))
for f in files:
    p = os.path.join(BASE, f)
    if not os.path.isfile(p): continue
    ext = f.lower().rsplit('.',1)[-1]
    print('\n\n========== '+f+' ==========')
    if ext=='docx':
        print(read_docx(p))
    elif ext=='doc':
        print(read_doc_raw(p))
    elif ext in ('xls','xlsx'):
        print(read_xls(p))
    else:
        print('[unsupported]')
