import openpyxl
PATH = r"C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-dbbbf867deba0599-2026年8月清远香海彼岸二期项目电费抄表用量及分摊请款明细表交财务.xlsx"
wb = openpyxl.load_workbook(PATH, data_only=True)
ws = wb["4 商铺-运营商-经营商-开发商-物业成本 等电表"]
mc = ws.max_column
# find the row that contains '上期' or '本期' or '用量' as header
hdr_row = None
for r in range(1, 12):
    vals = [ws.cell(r,c).value for c in range(1, mc+1)]
    if any(v and ('上期' in str(v) or '本期' in str(v) or '用量' in str(v)) for v in vals):
        hdr_row = r
        print("HEADER ROW =", r)
        # print non-empty header cells with col index
        for c in range(1, mc+1):
            v = ws.cell(r,c).value
            if v not in (None,''):
                print("  col%d = %r" % (c, v))
        break
print("\n--- R64 (row 64) ---")
for c in range(1, mc+1):
    v = ws.cell(64,c).value
    if v not in (None,''):
        print("  col%d = %r" % (c, v))
print("\n--- R210 (row 210) ---")
for c in range(1, mc+1):
    v = ws.cell(210,c).value
    if v not in (None,''):
        print("  col%d = %r" % (c, v))
# also print neighbor rows to see pattern
print("\n--- R63,R65 (neighbors of R64) ---")
for r in (63,65):
    print("R%d:"%r, [ (c, ws.cell(r,c).value) for c in range(1, 20) if ws.cell(r,c).value not in (None,'') ])
print("\n--- R209,R211 (neighbors of R210) ---")
for r in (209,211):
    print("R%d:"%r, [ (c, ws.cell(r,c).value) for c in range(1, 20) if ws.cell(r,c).value not in (None,'') ])
