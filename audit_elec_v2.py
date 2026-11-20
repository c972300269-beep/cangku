import openpyxl
PATH = r"C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-dbbbf867deba0599-2026年8月清远香海彼岸二期项目电费抄表用量及分摊请款明细表交财务.xlsx"
wb = openpyxl.load_workbook(PATH, data_only=True)
out=[]
def log(s=""): out.append(str(s))
def num(v):
    try:
        if v is None: return None
        return float(v)
    except: return None

log("="*70); log("电费请款明细表 数据审核（仅 2026年7-8月本期，修正列映射）"); log("="*70)
log("周期: 2026.7.27-2026.8.26  | 本期数值落在 sheet④ 的 8月 列 (col34=月读数,col35=用量,col36=金额)"); log()

# ---- 汇总表加总 ----
ws1 = wb["1 电费汇总表"]
sub=[]
for r in range(1, ws1.max_row+1):
    a=ws1.cell(r,1).value; b=num(ws1.cell(r,2).value)
    if a and ('代收代缴' in str(a) or '物业成本' in str(a)) and b is not None:
        sub.append((a,b))
total=sum(b for _,b in sub)
log("【1】汇总表(1) 分项加总")
for a,b in sub: log("   %-30s %12.2f"%(a,b))
# find 合计 row
sumv=None
for r in range(1, ws1.max_row+1):
    if ws1.cell(r,1).value and '合计' in str(ws1.cell(r,1).value):
        sumv=num(ws1.cell(r,2).value); break
log("   小计 = %.2f ; 合计行= %.2f ; 差=%.4f"%(total, sumv if sumv else 0, total-(sumv or 0)))

# ---- 一级划扣 ----
ws3 = wb["3 电费申请划扣汇总表"]
last=ws3.max_row
log("\n【2】一级电表划扣汇总(3): 总用量=%.1f 申请划扣=%.2f"%(num(ws3.cell(last,2).value) or 0, num(ws3.cell(last,3).value) or 0))

# ---- sheet② 列结构 ----
ws2 = wb["2 收费系统导出当月应收电费明细单据"]
hdr={c:ws2.cell(1,c).value for c in range(1,ws2.max_column+1)}
nrow=sum(1 for r in range(2,ws2.max_row+1) if ws2.cell(r,1).value)
col8=sum(num(ws2.cell(r,8).value) or 0 for r in range(2,ws2.max_row+1) if ws2.cell(r,8).value is not None and isinstance(ws2.cell(r,8).value,(int,float)))
col9=sum(num(ws2.cell(r,9).value) or 0 for r in range(2,ws2.max_row+1))
col10=sum(num(ws2.cell(r,10).value) or 0 for r in range(2,ws2.max_row+1))
col11=sum(num(ws2.cell(r,11).value) or 0 for r in range(2,ws2.max_row+1))
col13=sum(num(ws2.cell(r,13).value) or 0 for r in range(2,ws2.max_row+1))
sample8 = ws2.cell(2,8).value
log("\n【3】收费系统应收明细(2): 数据行=%d"%nrow)
log("   列8(应收金额)样本= %r  -> 实为费用名称文本，非金额"%sample8)
log("   列9(减免金额)合计=%.2f  列10(实际应收)合计=%.2f  列11(已收)合计=%.2f  列13(违约金)合计=%.2f"%(col9,col10,col11,col13))
log("   汇总表'收费系统当月应收合计(1+2)'=107429.27 ; 与列9/列11真实金额 %.2f 仅差 %.2f"%(col9, abs(col9-107429.27)))

# ---- sheet④ 本期(8月)校验 ----
ws4 = wb["4 商铺-运营商-经营商-开发商-物业成本 等电表"]
log("\n【4】商铺等电表(4) 本期(8月)用量×单价=金额 (用量列已含倍率) + 负用量扫描")
neg=[]; bad=[]; chk=0; cur_total_use=0.0; cur_total_amt=0.0
for r in range(4, ws4.max_row+1):
    nm=ws4.cell(r,1).value
    if nm is None or nm=='合计': continue
    price=num(ws4.cell(r,8).value); mult=num(ws4.cell(r,7).value)
    m = mult if (mult not in (None,0)) else 1
    # 本期 = 8月 列
    rd8=num(ws4.cell(r,34).value); use8=num(ws4.cell(r,35).value); amt8=num(ws4.cell(r,36).value)
    rd7=num(ws4.cell(r,31).value)  # 7月读数(上期)
    if use8 is None: continue
    if use8 < -0.01:
        neg.append((r,nm,round(rd7,1) if rd7 else None,round(rd8,1),round(use8,1)))
    if price is not None and price>0 and amt8 is not None:
        chk+=1
        # 用量列已含倍率, 金额=用量×单价 (不再×倍率)
        exp = use8*price
        if abs(exp-amt8)>0.5:
            bad.append((r,nm,round(use8,2),round(price,4),round(m,2),round(exp,2),round(amt8,2)))
        cur_total_use+=use8; cur_total_amt+=amt8
log("   本期(8月)已校验金额行数=%d"%chk)
log("   本期用量合计=%.2f  本期金额合计=%.2f"%(cur_total_use,cur_total_amt))
if neg:
    log("   ❌ 本期负用量行(%d): %s"%(len(neg), neg[:10]))
else:
    log("   ✅ 本期(8月)无任何负用量/倒走读数 -> R64、R210 原'负数'均在1月列(历史),非本期")
if bad:
    log("   ❌ 本期用量×单价≠金额 的行(%d):"%len(bad))
    for b in bad[:20]: log("      R%d %s 用量=%.2f 单价=%.4f 倍率=%.2f 计算=%.2f 表内=%.2f"%(b[0],b[1],b[2],b[3],b[4],b[5],b[6]))
else:
    log("   ✅ 本期用量×单价=金额 全部一致(无异常)")

# ---- 公摊表(6) 本期(8月) ----
ws6 = wb["6 公摊电表数"]
log("\n【5】公摊电表数(6) 本期(8月)用量×单价=金额")
bad6=[]; chk6=0; amt6=0.0; use6=0.0
for r in range(4, ws6.max_row+1):
    nm=ws6.cell(r,1).value
    if nm is None or nm=='合计': continue
    u=num(ws6.cell(r,11).value); price=num(ws6.cell(r,10).value); am=num(ws6.cell(r,12).value)
    if u is None or price is None or price<=0: continue
    chk6+=1; exp=u*price
    if am is not None:
        if abs(exp-am)>0.05: bad6.append((r,nm,round(u,2),round(price,4),round(exp,2),round(am,2)))
        amt6+=am; use6+=u
log("   已校验行=%d  金额合计=%.2f  用量合计=%.2f"%(chk6,amt6,use6))
log("   ✅ 全部一致" if not bad6 else "   ❌ %s"%bad6[:10])

# ---- 单价/周期 ----
log("\n【6】单价扫描 & 周期一致性")
prices=set()
for r in range(4,ws4.max_row+1):
    p=num(ws4.cell(r,8).value)
    if p and p>0: prices.add(round(p,4))
log("   sheet4 出现单价: %s"%sorted(prices))
cyc=set()
for r in range(1,ws1.max_row+1):
    v=ws1.cell(r,1).value
    if v and '2026' in str(v): cyc.add(str(v))
log("   汇总表周期文本: %s"%cyc)

log("\n审核完毕（本期7-8月口径）。")
open(r"E:\workbuddy\Claw\.workbuddy\scripts\audit_elec_v2_out.txt","w",encoding="utf-8").write("\n".join(out))
print("\n".join(out))
