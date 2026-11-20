import openpyxl
PATH = r"C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-dbbbf867deba0599-2026年8月清远香海彼岸二期项目电费抄表用量及分摊请款明细表交财务.xlsx"
wb = openpyxl.load_workbook(PATH, data_only=True)
ws4 = wb["4 商铺-运营商-经营商-开发商-物业成本 等电表"]
print("=== rows with 倍率 != 1 (sample) ===")
cnt=0
for r in range(4, ws4.max_row+1):
    m=ws4.cell(r,7).value
    try: mf=float(m)
    except: mf=1
    if mf not in (1, None) and mf!=0:
        nm=ws4.cell(r,1).value
        rd7=ws4.cell(r,31).value; rd8=ws4.cell(r,34).value
        use8=ws4.cell(r,35).value; price=ws4.cell(r,8).value; amt8=ws4.cell(r,36).value
        # try both formulas
        f_no = (use8*price) if (use8 and price) else None
        f_yes = (use8*mf*price) if (use8 and price) else None
        def fl(x):
            try: return float(x)
            except: return None
        rd7f,rd8f = fl(rd7), fl(rd8)
        rd_diff = (rd8f-rd7f) if (rd8f and rd7f) else None
        print("R%d %s 倍率=%.2f | 7月读=%s 8月读=%s 差=%s | 用量=%s 单价=%s 金额=%s | 用量*单价=%.2f 用量*单价*倍率=%.2f"
              %(r,nm,mf,rd7,rd8,rd_diff,use8,price,amt8, f_no if f_no else 0, f_yes if f_yes else 0))
        cnt+=1
        if cnt>=12: break
