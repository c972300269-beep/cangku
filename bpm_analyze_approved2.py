import json, re, datetime
from collections import Counter

raw = open('.workbuddy/bpm_output/hist_MyRequest_Approved.json', encoding='utf-8').read()
def fix_date(m):
    p = [int(x.strip()) for x in m.group(1).split(',')]
    y, mo, d = p[0], p[1]+1, (p[2] if len(p)>2 else 1)
    hh = p[3] if len(p)>3 else 0; mi = p[4] if len(p)>4 else 0; ss = p[5] if len(p)>5 else 0
    mo -= 1; y += mo//12; mo %= 12; mo += 1
    try: dt = datetime.datetime(y,mo,d,hh,mi,ss)
    except: dt = datetime.datetime(y,mo,1,hh,mi,ss)
    return '"'+dt.isoformat()+'"'
clean = re.sub(r'new Date\(([^)]+)\)', fix_date, raw)
j = json.loads(clean)
kids = j['children']
dates = [datetime.datetime.fromisoformat(it['CreateAt']) for it in kids if it.get('CreateAt')]
print('本批500条 CreateAt 范围:', min(dates).date(), '~', max(dates).date())
# 最近一个月窗口
cut = datetime.datetime(2026,9,8)
recent = [it for it in kids if it.get('CreateAt') and datetime.datetime.fromisoformat(it['CreateAt']) >= cut]
print(f'CreateAt >= 2026-09-08 的条数: {len(recent)}')
# 流程名分布
names = Counter(it.get('ProcessName','') for it in kids)
print('\n=== 流程名(ProcessName) Top 30 ===')
for n,c in names.most_common(30):
    print(f'  {c:4d}  {n}')
# NC 相关关键词
kw = ['NC','付款','请款','支付','结算','报销','合同','付','款','SRM']
print('\n=== 含NC/付款/请款 等关键词的 ProcessName 分布 ===')
nc_names = Counter()
for it in kids:
    nm = it.get('ProcessName','') or ''
    if any(k in nm for k in kw):
        nc_names[nm]+=1
for n,c in nc_names.most_common(30):
    print(f'  {c:4d}  {n}')
