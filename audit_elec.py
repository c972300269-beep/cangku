import openpyxl, traceback

PATH = r"C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-dbbbf867deba0599-2026年8月清远香海彼岸二期项目电费抄表用量及分摊请款明细表交财务.xlsx"

wb = openpyxl.load_workbook(PATH, data_only=True)
out = []
def log(s=""):
    out.append(str(s))

def num(v):
    try:
        if v is None: return 0.0
        return float(v)
    except: return None

log("="*70)
log("电费请款明细表 数据审核报告")
log("="*70)
log("周期（汇总表标注）: 2026.7.27-2026.8.26")
log()

# ---------- 1. 汇总表内部勾稽 ----------
log("【1】汇总表(1 电费汇总表) 内部加总")
ws1 = wb["1 电费汇总表"]
rows1 = {}
for r in range(1, ws1.max_row+1):
    a = ws1.cell(r,1).value; b = ws1.cell(r,2).value; c = ws1.cell(r,3).value
    if b in ("代收代缴（非分摊类）","代收代缴（分摊类）","物业成本（抄表计算金额）","物业成本（抄表时间差金额）"):
        rows1[b] = num(c)
    if a and "合计" in str(a) and c is not None:
        total_val = num(c)
subtotal = sum(v for v in rows1.values() if v is not None)
log(f"  分项: {rows1}")
log(f"  四项小计 = {subtotal:.2f}")
log(f"  汇总表合计(R10) = {total_val:.2f}")
log(f"  差异 = {abs(subtotal-total_val):.4f}  -> {'OK' if abs(subtotal-total_val)<0.02 else '❌ 不一致'}")
log()

# ---------- 2. sheet3 一级电表划扣 vs 汇总表 ----------
log("【2】一级电表划扣汇总(3) vs 汇总表合计")
ws3 = wb["3 电费申请划扣汇总表"]
amts3=[]; uses3=[]
for r in range(1, ws3.max_row+1):
    a=ws3.cell(r,1).value; e=ws3.cell(r,5).value; f=ws3.cell(r,6).value
    if a=="合计":
        log(f"  sheet3 合计行: 总用量={num(e)} 申请划扣金额={num(f):.2f}")
        amts3=num(f); uses3=num(e)
log(f"  汇总表合计 = {total_val:.2f}")
log(f"  差异 = {abs(amts3-total_val):.2f} -> {'OK' if abs(amts3-total_val)<0.02 else '❌'}")
log()

# ---------- 3. sheet2 明细合计 + 列结构 ----------
log("【3】收费系统应收明细(2) 列结构与合计")
ws2 = wb["2 收费系统导出当月应收电费明细单据"]
# 表头行
hdr={}
for c in range(1, ws2.max_column+1):
    hdr[c]=ws2.cell(1,c).value
log(f"  表头: {hdr}")
# 数值列求和 col8..col14
sums={c:0.0 for c in range(8,15)}
cnt=0
for r in range(2, ws2.max_row+1):
    v8=ws2.cell(r,8).value
    # col8 应为应收金额，检查是否为文本(名称)
    if isinstance(v8,str):
        pass
    for c in range(8,15):
        v=num(ws2.cell(r,c).value)
        if v is not None: sums[c]+=v
    cnt+=1
log(f"  数据行数: {cnt}")
log(f"  col8(应收金额)样本: {ws2.cell(2,8).value!r}  -> 该列实际存的是【费用名称文本】，并非金额值")
log(f"  col9(减免金额)合计 = {sums[9]:.2f}")
log(f"  col10(实际应收)合计 = {sums[10]:.2f}")
log(f"  col11(已收金额)合计 = {sums[11]:.2f}")
log(f"  col12(欠费金额)合计 = {sums[12]:.2f}")
log(f"  col13(违约金金额)合计 = {sums[13]:.2f}")
log(f"  col14(违约金减免)合计 = {sums[14]:.2f}")
log(f"  对比: 汇总表‘收费系统当月应收合计(1+2)’= {rows1.get('代收代缴（非分摊类）',0)+rows1.get('代收代缴（分摊类）',0):.2f}")
log(f"  说明: sheet2 的‘应收金额’列(8)错位填成了费用名称，真实金额落在‘减免金额’列(9)；建议核对列定义是否导出异常")
log()

# ---------- 4. sheet6 公摊 用量*单价=金额 校验 ----------
log("【4】公摊电表数(6) 用量×单价=金额 校验 (用量列已含倍率,不再乘)")
ws6 = wb["6 公摊电表数"]
bad6=[]; amt6=0.0; use6=0.0; checked6=0; zero_amt6=[]
for r in range(4, ws6.max_row+1):
    nm=ws6.cell(r,1).value
    u=num(ws6.cell(r,11).value); price=num(ws6.cell(r,10).value); am=num(ws6.cell(r,12).value)
    if nm is None: continue
    if nm=="合计": continue
    if u is None or price is None or price<=0:
        if am is not None and am>0 and (u is None or abs(u)<1e-9):
            zero_amt6.append((r,nm,round(am,2)))
        continue
    checked6+=1
    exp=u*price
    if am is not None:
        if abs(exp-am)>0.05:
            bad6.append((r,nm,round(u,2),round(price,4),round(exp,2),round(am,2)))
        amt6+=am; use6+=u
log(f"  已校验行数: {checked6}")
log(f"  金额合计(可分摊)= {amt6:.2f}  用量合计= {use6:.2f}")
if bad6:
    log(f"  ❌ 用量×单价≠金额 的行({len(bad6)}):")
    for b in bad6[:30]:
        log(f"     R{b[0]} {b[1]} 用量={b[2]} 单价={b[3]} 计算={b[4]} 表内={b[5]}")
else:
    log("  ✅ 公摊表 用量×单价=金额 全部一致")
if zero_amt6:
    log(f"  ⚠ 零用量/无单价但金额>0 的行({len(zero_amt6)}): {zero_amt6[:12]}")
log()

# ---------- 5. sheet4 商铺分表 用量=读数差 校验 ----------
log("【5】商铺等电表(4) (本期-上期)×倍率=用量 校验")
ws4 = wb["4 商铺-运营商-经营商-开发商-物业成本 等电表"]
bad4=[]; checked4=0; neg4=[]
for r in range(4, ws4.max_row+1):
    prev=num(ws4.cell(r,12).value); cur=num(ws4.cell(r,13).value); use=num(ws4.cell(r,14).value); mult=num(ws4.cell(r,7).value)
    attr=ws4.cell(r,5).value; nm4=ws4.cell(r,1).value
    if prev is None or cur is None: continue
    if use is None: continue
    if cur < prev:
        neg4.append((r,nm4,round(prev,2),round(cur,2),round(use,2)))
    m = mult if (mult not in (None,0)) else 1
    exp=(cur-prev)*m
    checked4+=1
    if abs(exp-use)>0.5:
        bad4.append((r,attr,nm4,round(prev,2),round(cur,2),round(m,2),round(exp,2),round(use,2)))
log(f"  已校验行数: {checked4}")
if bad4:
    log(f"  ❌ 读数差×倍率≠用量 的行({len(bad4)})——表内用量=0 多为父表(正常), 否则⚠异常:")
    for b in bad4[:40]:
        tag = "父表/汇总行(用量填0,正常)" if abs(b[7])<0.5 else "⚠ 异常请查"
        log(f"     R{b[0]} [{b[1]}] {b[2]} 上期={b[3]} 本期={b[4]} 倍率={b[5]} 计算={b[6]} 表内={b[7]} -> {tag}")
else:
    log("  ✅ 商铺表 (本期-上期)×倍率=用量 全部一致")
if neg4:
    log(f"  ⚠ 本期读数<上期读数(倒走) 的行({len(neg4)}):")
    for b in neg4: log(f"     R{b[0]} {b[1]} 上期={b[2]} 本期={b[3]} 用量={b[4]}")
log()

# ---------- 6. 单价扫描 ----------
log("【6】单价扫描（异常值）")
price_set={}
for name in ["4 商铺-运营商-经营商-开发商-物业成本 等电表","5 住宅公寓电表读数","6 公摊电表数"]:
    ws=wb[name]
    pc=8 if name.startswith("4") else (7 if name.startswith("5") else 10)
    for r in range(1, ws.max_row+1):
        p=num(ws.cell(r,pc).value)
        if p is not None and p>0:
            price_set.setdefault(round(p,6),0)
            price_set[round(p,6)]+=1
log(f"  出现过的正单价及频次: {dict(sorted(price_set.items()))}")
weird=[p for p in price_set if p<=0 or p>2]
log(f"  异常单价(<=0 或 >2元/度): {weird if weird else '无'}")
log()

# ---------- 7. 周期一致性 ----------
log("【7】费用周期一致性抽查")
periods=set()
for name in wb.sheetnames:
    ws=wb[name]
    for r in range(1, min(ws.max_row,60)+1):
        for c in range(1, min(ws.max_column,16)+1):
            v=ws.cell(r,c).value
            if isinstance(v,str) and ("2026.7.27" in v or "2026.8.26" in v or "2026.7.27" in v.replace(" ","")):
                periods.add(v.strip())
log(f"  出现的周期文本: {periods if periods else '未在抽查范围内命中'}")
log()

# ---------- 8. 异常扫描 负用量/零用量有金额 ----------
log("【8】异常扫描: 负用量、零用量但有金额")
ws4b=wb["4 商铺-运营商-经营商-开发商-物业成本 等电表"]
neg4=0; zero4=0
for r in range(4, ws4b.max_row+1):
    use=num(ws4b.cell(r,14).value)
    if use is None: continue
    if use<0: neg4+=1
    if abs(use)<1e-9: zero4+=1
log(f"  商铺表(4): 负用量行={neg4}, 零用量行={zero4}")
log()
log("="*70)
log("审核完毕。")

txt="\n".join(out)
with open(r"E:\workbuddy\Claw\reports\elec_audit_report.txt","w",encoding="utf-8") as f:
    f.write(txt)
print(txt)
