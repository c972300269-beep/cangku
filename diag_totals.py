import openpyxl
PATH = r"C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-dbbbf867deba0599-2026年8月清远香海彼岸二期项目电费抄表用量及分摊请款明细表交财务.xlsx"
wb = openpyxl.load_workbook(PATH, data_only=True)
ws1 = wb["1 电费汇总表"]
print("=== 汇总表 全部非空行 (col1,col2,col3,col4) ===")
for r in range(1, ws1.max_row+1):
    vals=[ws1.cell(r,c).value for c in range(1,6)]
    if any(v not in (None,'') for v in vals):
        print("R%d:"%r, vals)
ws3 = wb["3 电费申请划扣汇总表"]
print("\n=== 一级划扣 末几行 ===")
for r in range(ws3.max_row-3, ws3.max_row+1):
    print("R%d:"%r, [ws3.cell(r,c).value for c in range(1,6)])
