import json, re, datetime
from collections import Counter

raw = open('.workbuddy/bpm_output/approved_all.json', encoding='utf-8').read()
def fix_date(m):
    p=[int(x.strip()) for x in m.group(1).split(',')]
    y,mo,d=p[0],p[1]+1,(p[2] if len(p)>2 else 1)
    hh=p[3] if len(p)>3 else 0; mi=p[4] if len(p)>4 else 0; ss=p[5] if len(p)>5 else 0
    mo-=1; y+=mo//12; mo%=12; mo+=1
    try: dt=datetime.datetime(y,mo,d,hh,mi,ss)
    except: dt=datetime.datetime(y,mo,1,hh,mi,ss)
    return '"'+dt.isoformat()+'"'
clean=re.sub(r'new Date\(([^)]+)\)',fix_date,raw)
data=json.loads(clean)
items=data['items']

cut=datetime.datetime(2026,9,8,tzinfo=datetime.timezone.utc)
recent=[it for it in items if it.get('CreateAt') and datetime.datetime.fromisoformat(it['CreateAt'])>=cut]
recent_sorted=sorted(recent,key=lambda x:x['CreateAt'],reverse=True)

# 严格 NC 付款类（走 NC单据支付结算 节点）
NC_PAY=['非合同请款','SRM合同请款','SRM非合同请款','结算审批','员工日常费用报销','合同请款','付款申请']
def cat(it):
    nm=it.get('ProcessName','') or ''
    if any(k in nm for k in NC_PAY): return 'NC付款类'
    if '补票' in nm: return '补票工单'
    if '盖章' in nm: return '盖章申请'
    return '其它行政/业务审批'

cat_counter=Counter(cat(it) for it in recent_sorted)
nc_pay=[it for it in recent_sorted if cat(it)=='NC付款类']
print('最近一月已审批通过 总数:',len(recent_sorted))
for c,n in cat_counter.most_common(): print(f'  {c}: {n}')
print('严格NC付款类:',len(nc_pay))

# 生成 HTML（自包含，不引外部CDN）
rows=''
for it in recent_sorted:
    d=it['CreateAt'][:10]; sn=it.get('SerialNum',''); nm=it.get('ProcessName','')
    c=cat(it); badge='<span style="color:#d6336c;font-weight:bold">NC付款</span>' if c=='NC付款类' else ''
    rows+=f'<tr><td>{d}</td><td>{sn}</td><td>{nm}</td><td>{badge}{"" if badge else c}</td></tr>\n'

html=f'''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>最近一月已审批通过流程（BPM）</title>
<style>
body{{font-family:"Microsoft YaHei","SimHei",sans-serif;margin:24px;background:#fff;color:#222}}
h1{{font-size:20px}} .card{{border:1px solid #e3e8ef;border-radius:10px;padding:16px;margin:14px 0;box-shadow:0 1px 3px #0001}}
table{{border-collapse:collapse;width:100%;font-size:14px}} th,td{{border:1px solid #d0d7de;padding:7px 10px;text-align:left}}
th{{background:#f1f5f9}} .note{{background:#fff8e6;border-left:4px solid #f59f00;padding:10px 14px;font-size:13px;line-height:1.7}}
.kpi{{display:flex;gap:14px;flex-wrap:wrap}} .kpi div{{background:#f8fafc;border:1px solid #e3e8ef;border-radius:8px;padding:12px 18px}}
.kpi b{{font-size:22px;color:#1c7ed6}}
</style></head><body>
<h1>最近一个月「已审批通过」流程清单（BPM · 我发起的）</h1>
<div class="card"><div class="kpi">
<div>已审批通过总数<b>{len(items)}</b></div>
<div>最近一月(2026-09-08~10-08)<b>{len(recent_sorted)}</b></div>
<div>其中NC付款类<b style="color:#d6336c">{len(nc_pay)}</b></div>
</div></div>
<div class="card"><h3>分类统计</h3><table>
<tr><th>类别</th><th>条数</th></tr>
{''.join(f'<tr><td>{c}</td><td>{n}</td></tr>' for c,n in cat_counter.most_common())}
</table></div>
<div class="card"><h3>明细（按发起日期倒序，共{len(recent_sorted)}条）</h3>
<table><tr><th>发起日期</th><th>流水号</th><th>流程名称</th><th>类型</th></tr>
{rows}</table></div>
<div class="note"><b>重要说明（数据口径与局限）：</b><br>
1. 数据来源：BPM「我发起的流程 → 已审批通过」({{len(items)}}条全量拉取）。「已审批通过」在系统接口里对应状态值 <code>Approved</code>（<code>Finished</code> 返回0，是接口限制）。<br>
2. <b>时间字段局限</b>：该接口只返回「发起时间 CreateAt」，<b>不返回审批完成时间</b>。所以本表的"最近一个月"=「发起于 2026-09-08 之后、且现已审批通过」。这意味着：① 早于9/8发起、但在9/8之后才审批通过的不在此列；② 9/8之后发起、但仍在审批中的也不在此列（在"审批中"里）。如需严格按"审批通过时间"筛选，BPM该列表接口不提供，需逐条点开流程看审批轨迹。<br>
3. <b>NC 口径</b>：「NC付款类」= 流程名含 非合同请款/SRM合同请款/SRM非合同请款/结算审批/员工费用报销/合同请款 等走「NC单据支付结算」节点的付款类流程；「补票工单」「盖章申请」虽描述中可能提及付款，但不属于NC支付结算主流程，单列。<br>
4. <b>值得留意</b>：最近一月通过的NC付款类仅 11 条，且<b>没有 SRM合同请款</b>通过——结合你早前说的"69条卡在NC单据支付结算节点"，说明大量SRM请款仍滞留NC，近一月实际走通的以"非合同请款"为主。
</div>
</body></html>'''
open('.workbuddy/tmp/dwg/reports/bpm_approved_recent.html','w',encoding='utf-8').write(html)
print('REPORT saved')
