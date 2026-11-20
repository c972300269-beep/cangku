import json, re, datetime
from collections import Counter, OrderedDict

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
print('已审批通过总数:',len(items))

cut=datetime.datetime(2026,9,8,tzinfo=datetime.timezone.utc)
recent=[it for it in items if it.get('CreateAt') and datetime.datetime.fromisoformat(it['CreateAt'])>=cut]
print('CreateAt>=2026-09-08 的条数:',len(recent))

# NC 相关识别：走 NC单据支付结算节点的付款/请款/结算/报销类
NC_KW=['请款','付款','支付','结算','报销','合同请款','付款申请','SAP','NC']
def is_nc(it):
    nm=it.get('ProcessName','') or ''
    desc=it.get('Description','') or ''
    return any(k in nm or k in desc for k in NC_KW)

nc=[it for it in recent if is_nc(it)]
other=[it for it in recent if not is_nc(it)]
print(f'\n其中 NC相关(付款/请款/结算/报销类): {len(nc)}')
print(f'其它(审批/调班/盖章/休假等): {len(other)}')

# 按流程名统计 NC 类
nc_names=Counter(it.get('ProcessName','') for it in nc)
print('\n=== 最近一月 NC相关 流程名分布 ===')
for n,c in nc_names.most_common():
    print(f'  {c:3d}  {n}')

# 输出明细（按日期倒序）
recent_sorted=sorted(recent,key=lambda x:x['CreateAt'],reverse=True)
print('\n=== 最近一月全部已审批明细（倒序，前60）===')
for it in recent_sorted[:60]:
    d=it['CreateAt'][:10]
    sn=it.get('SerialNum','')
    nm=it.get('ProcessName','')
    tag='[NC]' if is_nc(it) else ''
    print(f'  {d}  {sn}  {nm}  {tag}')

# 落盘结构化结果
out={'total_approved':len(items),'recent_count':len(recent),'nc_count':len(nc),'other_count':len(other),
     'window':'2026-09-08 ~ 2026-10-08','items':[{'date':it['CreateAt'][:10],'sn':it.get('SerialNum'),'name':it.get('ProcessName'),'desc':(it.get('Description') or '')[:80],'nc':is_nc(it)} for it in recent_sorted]}
json.dump(out,open('.workbuddy/bpm_output/approved_recent.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('\n已保存 approved_recent.json')
