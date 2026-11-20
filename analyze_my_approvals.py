# -*- coding: utf-8 -*-
import json, datetime, html

PATH = r"E:\workbuddy\Claw\.workbuddy\bpm_output\my_applying_requests.json"
OUT  = r"E:\workbuddy\Claw\reports\bpm_my_approving_report.html"

now = datetime.datetime(2026, 9, 15, 18, 29, 6)
NOW_ISO = "2026-09-15 18:29"

def parse_dt(s):
    if not s: return None
    s = s.replace('Z','+00:00')
    try: return datetime.datetime.fromisoformat(s).replace(tzinfo=None)
    except: return None

import re
raw = open(PATH, encoding='utf-8').read()
# 将 Java 序列化的 new Date(y,m,d,h,mi,s) 还原为 ISO 字符串（月份 0-based）
def fix_date(m):
    try:
        parts = [int(x.strip()) for x in m.group(1).split(',') if x.strip() != '']
        y, mo, d = parts[0], parts[1] + 1, parts[2]
        h = parts[3] if len(parts) > 3 else 0
        mi = parts[4] if len(parts) > 4 else 0
        s = parts[5] if len(parts) > 5 else 0
        dt = datetime.datetime(y, mo, d, h, mi, s)
        return '"' + dt.strftime('%Y-%m-%dT%H:%M:%S') + '"'
    except Exception:
        return 'null'
raw = re.sub(r'new Date\(([^)]*)\)', fix_date, raw)
data = json.loads(raw)
children = data.get('children', [])
total = data.get('total', len(children))

rows = []
for it in children:
    sn = it.get('SerialNum','')
    name = it.get('ProcessName','')
    desc = it.get('Description','')
    create = it.get('CreateAt','')
    state = it.get('State', {})
    steps = state.get('children', []) if isinstance(state, dict) else []
    step_names = [s.get('StepName','') for s in steps]
    recipients = []
    for s in steps:
        r = (s.get('RecipientDisplayName') or '').strip()
        if r and r not in recipients:
            recipients.append(r)
    # 关键审批节点（排除"知会"类知会节点）
    key_steps = []
    for s in steps:
        snm = (s.get('StepName') or '')
        r = (s.get('RecipientDisplayName') or '').strip()
        if '知会' in snm:
            continue
        key_steps.append((snm, r))
    rows.append({
        'sn': sn, 'name': name, 'desc': desc, 'create': create,
        'steps': step_names, 'recipients': recipients, 'key': key_steps
    })

# 按"关键处理人"分组（非知会节点）
group = {}
for r in rows:
    if r['key']:
        label = r['key'][0][1] or '(未知)'
        node = r['key'][0][0]
    else:
        label = r['recipients'][0] if r['recipients'] else '(未知)'
        node = r['steps'][0] if r['steps'] else ''
    group.setdefault(label, []).append((r, node))

# 最近7天新增
recent7 = [r for r in rows if (parse_dt(r['create']) and (now - parse_dt(r['create'])).days <= 7)]
# 超半年（>180天）
over_half = [r for r in rows if (parse_dt(r['create']) and (now - parse_dt(r['create'])).days > 180)]
# 需手动处理：在人工节点（非 NC系统管理员 / 非 系统管理员 / 非 自己取件 的知会）
def is_manual(r):
    if not r['key']:
        return False
    nm, person = r['key'][0]
    if 'NC单据' in nm or 'NC系统' in person: return False
    if '系统管理员' in person and '时代中国' in person: return True  # 系统管理员也是人工待办
    if person == '陈家林': return True  # 自行取件/待本人
    if 'NC' in person: return False
    return True

manual = [r for r in rows if is_manual(r)]

# 生成 HTML
def esc(x): return html.escape(str(x))

lines = []
lines.append(f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BPM流程概览 — "我发起的流程"审批中</title>
<style>
body{{font-family:-apple-system,"Microsoft YaHei",sans-serif;margin:0;background:#f5f6f8;color:#222;padding:18px;}}
h1{{font-size:20px;margin:0 0 4px;}}
.meta{{color:#888;font-size:13px;margin-bottom:14px;}}
.card{{background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);}}
h2{{font-size:16px;margin:0 0 10px;border-left:4px solid #2d7ff9;padding-left:8px;}}
table{{width:100%;border-collapse:collapse;font-size:13px;}}
th,td{{border:1px solid #e6e6e6;padding:6px 8px;text-align:left;vertical-align:top;}}
th{{background:#f0f4fa;}}
tr:nth-child(even){{background:#fafbfc;}}
.pill{{display:inline-block;padding:1px 7px;border-radius:10px;font-size:12px;}}
.p-red{{background:#fde8e8;color:#c0392b;}}
.p-blue{{background:#e8f1fd;color:#2d7ff9;}}
.p-gray{{background:#eef0f2;color:#666;}}
.p-amber{{background:#fff3e0;color:#b9770e;}}
.warn{{background:#fff4e5;border:1px solid #ffd699;border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;}}
.note{{color:#666;font-size:12px;}}
</style></head><body>
<h1>BPM流程概览 — "我发起的流程"审批中</h1>
<div class="meta">查询时间：{NOW_ISO} ｜ 数据来源：bpm.timesgroup.cn · 我发起 · 审批中 ｜ 总条数：<b>{total}</b></div>
""")

# 按当前节点（关键处理人）分类
lines.append('<div class="card"><h2>① 按当前节点（到谁了）分类</h2>')
lines.append('<table><tr><th>当前处理人</th><th>所在节点</th><th>条数</th><th>明细（流水号 · 描述）</th></tr>')
# 排序：人工优先
order = []
for k, v in group.items():
    order.append((k, v))
def sortkey(item):
    k = item[0]
    if k == 'NC系统管理员': return (3, k)
    if '系统管理员' in k: return (2, k)
    if k == '陈家林': return (1, k)
    return (0, k)
order.sort(key=sortkey)
for k, v in order:
    node = v[0][1]
    detail = '<br>'.join(f'{esc(r["sn"])} · {esc(r["desc"][:40])}' for r, _ in v)
    cls = 'p-red' if k not in ('NC系统管理员',) else 'p-gray'
    lines.append(f'<tr><td><span class="pill {cls}">{esc(k)}</span></td><td>{esc(node)}</td><td><b>{len(v)}</b></td><td class="note">{detail}</td></tr>')
lines.append('</table></div>')

# 最近7天新增
lines.append('<div class="card"><h2>② 最近 7 天新增（2026-09-08 起）</h2>')
lines.append(f'<div class="note">共 {len(recent7)} 条。以下为近期新发起、仍在审批中的流程。</div><table><tr><th>序号</th><th>流水号</th><th>流程名</th><th>描述</th><th>创建时间</th><th>当前到谁</th></tr>')
recent7.sort(key=lambda r: parse_dt(r['create']) or now, reverse=True)
for i, r in enumerate(recent7, 1):
    who = r['key'][0][1] if r['key'] else (r['recipients'][0] if r['recipients'] else '')
    cr = (parse_dt(r['create'])).strftime('%Y-%m-%d %H:%M') if parse_dt(r['create']) else r['create']
    lines.append(f'<tr><td>{i}</td><td>{esc(r["sn"])}</td><td>{esc(r["name"])}</td><td>{esc(r["desc"][:50])}</td><td>{esc(cr)}</td><td>{esc(who)}</td></tr>')
lines.append('</table></div>')

# 超半年
lines.append('<div class="warn">📌 <b>超半年老流程提醒（{0} 条）</b>：以下流程创建已超过 180 天仍在审批中，建议跟进或催办/清理。<br>'.format(len(over_half)))
oh = sorted(over_half, key=lambda r: parse_dt(r['create']) or now)
ol = '<br>'.join(f'{esc(r["sn"])} · {esc(r["name"])} · {esc(r["desc"][:30])} · 创建 {esc((parse_dt(r["create"])).strftime("%Y-%m-%d") if parse_dt(r["create"]) else r["create"])}' for r in oh)
lines.append(ol + '</div>')

# 需手动处理
lines.append('<div class="warn" style="background:#fff0f0;border-color:#ffb3b3;">⚠️ <b>需人工跟进 / 手动处理（{0} 条）</b>：这些不在 NC 系统自动节点，需要具体人（或你本人）操作，否则会一直卡住。<br>'.format(len(manual)))
ml = []
for r in manual:
    who = r['key'][0][1] if r['key'] else '?'
    node = r['key'][0][0] if r['key'] else ''
    ml.append(f'{esc(r["sn"])} · {esc(r["desc"][:36])} → <b>{esc(node)}</b> @ {esc(who)}')
lines.append('<br>'.join(ml) + '</div>')

lines.append('<div class="note">说明：节点含"知会"的（如 模块管理负责人（财务）（知会）欧义昌）不计入卡点；"NC单据支付结算"由 NC 系统管理员自动处理，属系统节点，需 NC 侧推送，非人工可催。</div>')
lines.append('</body></html>')

open(OUT, 'w', encoding='utf-8').write('\n'.join(lines))

# 控制台摘要
print(f"总条数: {total}")
print(f"分组({len(group)}):")
for k, v in order:
    print(f"  {k} ({v[0][1]}): {len(v)} 条")
print(f"最近7天新增: {len(recent7)}")
print(f"超半年: {len(over_half)}")
print(f"需手动处理: {len(manual)}")
print(f"report -> {OUT}")
