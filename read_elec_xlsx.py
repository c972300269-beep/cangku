import openpyxl, sys

path = r"F:\xwechat_files\c972300269_6716\temp\RWTemp\2026-09\31c29b230661035f7713da0a6ee5ce0d\2026年8月清远香海彼岸二期项目电费抄表用量及分摊请款明细表交财务(1).xlsx"

wb = openpyxl.load_workbook(path, data_only=True)
print("SHEETS:", wb.sheetnames)
for ws in wb.worksheets:
    print("\n" + "="*80)
    print("SHEET:", ws.title, "| dims:", ws.dimensions, "| rows:", ws.max_row, "cols:", ws.max_column)
    print("="*80)
    for r in range(1, min(ws.max_row, 40)+1):
        rowvals = []
        for c in range(1, min(ws.max_column, 14)+1):
            v = ws.cell(row=r, column=c).value
            if v is not None:
                rowvals.append(f"[{c}]{v}")
        if rowvals:
            s = " | ".join(str(x) for x in rowvals)
            if len(s) > 300: s = s[:300] + "..."
            print(f"R{r:>3}: {s}")
