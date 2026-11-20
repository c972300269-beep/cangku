import json, re, datetime, sys

raw = open('.workbuddy/bpm_output/hist_MyRequest_Approved.json', encoding='utf-8').read()

def fix_date(m):
    parts = [int(x.strip()) for x in m.group(1).split(',')]
    y, mo = parts[0], parts[1] + 1
    d = parts[2] if len(parts) > 2 else 1
    hh = parts[3] if len(parts) > 3 else 0
    mi = parts[4] if len(parts) > 4 else 0
    ss = parts[5] if len(parts) > 5 else 0
    # 处理月份/日溢出（模拟 JS Date 进位）
    mo -= 1
    y += mo // 12
    mo %= 12
    mo += 1
    try:
        dt = datetime.datetime(y, mo, d, hh, mi, ss)
    except ValueError:
        # 日溢出则归到当月1号
        dt = datetime.datetime(y, mo, 1, hh, mi, ss)
    return '"' + dt.isoformat() + '"'

clean = re.sub(r'new Date\(([^)]+)\)', fix_date, raw)
j = json.loads(clean)

print('total字段:', j.get('total'), '| children条数:', len(j.get('children', [])))
kids = j['children']
# 列出所有字段名
print('=== 第一条所有字段名 ===')
for k in kids[0].keys():
    print('  ', k)
print('=== 时间相关字段抽样（前3条）===')
time_fields = [k for k in kids[0].keys() if 'at' in k.lower() or 'time' in k.lower() or 'date' in k.lower() or 'create' in k.lower() or 'finish' in k.lower() or 'end' in k.lower() or 'modify' in k.lower()]
print('疑似时间字段:', time_fields)
for it in kids[:3]:
    print('---')
    for k in time_fields:
        print(f'   {k}: {it.get(k)}')
