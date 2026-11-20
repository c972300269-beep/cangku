# -*- coding: utf-8 -*-
import glob, sys, os
import openpyxl

pattern = "C:/Users/chenjialin3/Downloads/*.xlsx"
files = [f for f in glob.glob(pattern) if "体检" in os.path.basename(f)]
print("matched:", len(files))
for f in sorted(files):
    print("=" * 72)
    print("FILE:", os.path.basename(f))
    try:
        wb = openpyxl.load_workbook(f, data_only=True, read_only=True)
    except Exception as e:
        print("  open err:", e)
        continue
    print("sheets:", wb.sheetnames)
    for ws in wb.worksheets:
        print("--- sheet:", ws.title, "dim", ws.max_row, "x", ws.max_column)
        cnt = 0
        for r in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 12), values_only=True):
            vals = [str(c).replace("\n", " ") for c in r if c is not None]
            if vals:
                print("   ", " | ".join(vals)[:230])
            cnt += 1
    wb.close()
