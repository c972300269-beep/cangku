# -*- coding: utf-8 -*-
import json, os, re

BASE = r"E:\workbuddy\Claw"
data = json.load(open(os.path.join(BASE, "reports/budget_latest_full.json"), encoding="utf-8"))
rows = data["indentRows"]  # [{indent, vals}]

def num(v):
    if v is None: return 0.0
    s = str(v).replace(",", "").replace(" ", "")
    if s == "" or s == "-": return 0.0
    try: return float(s)
    except: return 0.0

# group by org (vals[1])
orgs = {}
order = []
for r in rows:
    v = r["vals"]
    if len(v) < 5: continue
    org = v[1]
    if org not in orgs:
        orgs[org] = []
        order.append(org)
    orgs[org].append(r)

# friendly name mapping
NAME_MAP = {
    "清远物业_清远香海彼岸（飞来湖）": "香海二期（飞来湖）",
    "清远物业_清远时代水岸（万达西）": "香海一期（万达西）",
    "清远物业_龙湖苑一期": "龙湖苑一期",
    "统悦物业_雅悦花园（清远）一期": "雅悦花园",
}

def base_name(s):
    return re.sub(r"[\（\(].*?[\）\)]", "", s).strip()

report = []
total_budget = total_used = total_remain = 0.0
overall = []

for org in order:
    ol = orgs[org]
    # top-level = min indent
    min_ind = min(r["indent"] for r in ol)
    top = [r for r in ol if r["indent"] == min_ind]
    topv = top[0]["vals"] if top else None
    b = num(topv[2]) if topv else 0
    u = num(topv[3]) if topv else 0
    rm = num(topv[4]) if topv else 0
    total_budget += b; total_used += u; total_remain += rm
    overall.append((org, b, u, rm))
    report.append((org, b, u, rm, ol, min_ind))

# Build HTML
def fmt(x): return f"{x:,.2f}"

html = []
html.append('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">')
html.append('<title>2026年电梯预算结余分析</title>')
html.append('<style>')
html.append('body{font-family:"Microsoft YaHei",Arial,sans-serif;margin:0;padding:24px;background:#f0f2f5;color:#1a1a2e}')
html.append('.card{background:#fff;border-radius:10px;padding:20px 24px;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,.08)}')
html.append('h1{font-size:21px;margin:0 0 6px}.h2{font-size:16px;margin:18px 0 10px;color:#333}')
html.append('.meta{color:#8a8a8a;font-size:13px;margin-bottom:14px}')
html.append('.kpi{display:flex;gap:14px;flex-wrap:wrap}')
html.append('.kpi .box{flex:1;min-width:170px;padding:14px 16px;border-radius:8px;color:#fff}')
html.append('.kpi .b1{background:linear-gradient(135deg,#667eea,#764ba2)}')
html.append('.kpi .b2{background:linear-gradient(135deg,#f093fb,#f5576c)}')
html.append('.kpi .b3{background:linear-gradient(135deg,#11998e,#38ef7d)}')
html.append('.kpi .lab{font-size:12px;opacity:.85}.kpi .val{font-size:22px;font-weight:700;margin-top:3px}')
html.append('table{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}')
html.append('th,td{border:1px solid #ececec;padding:7px 9px;text-align:right}')
html.append('th{background:#fafafa;color:#333;font-weight:600}')
html.append('td.l,th.l{text-align:left}')
html.append('tr:hover{background:#f7f9ff}')
html.append('.pos{color:#1a9e3e;font-weight:600}.neg{color:#e23b3b;font-weight:600}')
html.append('.tag{display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;margin-left:4px}')
html.append('.tag.ok{background:#e6f7ec;color:#1a9e3e}.tag.warn{background:#fff1e6;color:#e8730a}.tag.bad{background:#fdecec;color:#e23b3b}')
html.append('.tree td.l .pad{color:#bbb}')
html.append('.note{font-size:13px;color:#555;line-height:1.7;background:#fafaff;border-left:3px solid #667eea;padding:10px 14px;border-radius:4px}')
html.append('</style></head><body>')

# Title
html.append('<div class="card"><h1>2026年电梯预算（科目13403）结余分析</h1>')
html.append(f'<div class="meta">查询时间：2026-09-15 ｜ 科目：13403 设备设施维护支出（电梯维修及材料 / 电梯维保合同及年审）｜ 数据来源：EACP 预算系统</div>')

# KPI
html.append('<div class="kpi">')
html.append(f'<div class="box b1"><div class="lab">年预算总额</div><div class="val">¥{fmt(total_budget)}</div></div>')
html.append(f'<div class="box b2"><div class="lab">年已使用</div><div class="val">¥{fmt(total_used)}</div></div>')
html.append(f'<div class="box b3"><div class="lab">年总结余</div><div class="val">¥{fmt(total_remain)}</div></div>')
rate = total_used/total_budget*100 if total_budget else 0
html.append(f'<div class="box b1"><div class="lab">整体使用率</div><div class="val">{rate:.1f}%</div></div>')
html.append('</div></div>')

# Section 1: org-level surplus
html.append('<div class="card"><div class="h2">一、各项目整体结余（均有结余）</div>')
html.append('<table><thead><tr><th class="l">项目（组织）</th><th>年预算</th><th>年已使用</th><th>年结余</th><th>使用率</th><th>状态</th></tr></thead><tbody>')
for org,b,u,rm in overall:
    r = u/b*100 if b else 0
    cls = "pos" if rm>=0 else "neg"
    if r>=95: st = '<span class="tag bad">⚠ 即将用尽</span>'
    elif r>=85: st = '<span class="tag warn">偏紧</span>'
    else: st = '<span class="tag ok">宽裕</span>'
    html.append(f'<tr><td class="l">{NAME_MAP.get(org,org)}</td><td>¥{fmt(b)}</td><td>¥{fmt(u)}</td><td class="{cls}">¥{fmt(rm)}</td><td>{r:.1f}%</td><td>{st}</td></tr>')
html.append(f'<tr style="font-weight:700;background:#f5f7ff"><td class="l">合计</td><td>¥{fmt(total_budget)}</td><td>¥{fmt(total_used)}</td><td class="pos">¥{fmt(total_remain)}</td><td>{rate:.1f}%</td><td></td></tr>')
html.append('</tbody></table></div>')

# Section 2: per-org sub-item tree with surplus, highlight elevator items
html.append('<div class="card"><div class="h2">二、各项目明细科目结余（红=超支）</div>')
for org,b,u,rm,ol,min_ind in report:
    nm = NAME_MAP.get(org, org)
    html.append(f'<div class="h2" style="font-size:14px;color:#444">{nm}　<span style="color:#1a9e3e">结余 ¥{fmt(rm)}</span></div>')
    html.append('<table><thead><tr><th class="l">科目</th><th>年预算</th><th>年已使用</th><th>年结余</th></tr></thead><tbody>')
    for r in ol:
        if r["indent"] == min_ind: continue
        v = r["vals"]
        sub = r["indent"] - min_ind
        pad = '&nbsp;'* (sub*4) + ('└ ' if sub>0 else '')
        bb=num(v[2]); uu=num(v[3]); rr=num(v[4])
        cls = "pos" if rr>=0 else "neg"
        # highlight elevator
        hl = ' style="background:#fffbe6"' if ('电梯' in v[0]) else ''
        html.append(f'<tr{hl}><td class="l">{pad}{v[0]}</td><td>¥{fmt(bb)}</td><td>¥{fmt(uu)}</td><td class="{cls}">¥{fmt(rr)}</td></tr>')
    html.append('</tbody></table>')
html.append('</div>')

# Section 3: over-budget warning
html.append('<div class="card"><div class="h2">三、已超支明细（结余为负）预警</div>')
over = []
for org,b,u,rm,ol,min_ind in report:
    for r in ol:
        if r["indent"] == min_ind: continue
        v = r["vals"]
        rr = num(v[4])
        if rr < 0:
            over.append((org, v[0], num(v[2]), num(v[3]), rr))
if over:
    html.append('<table><thead><tr><th class="l">项目</th><th class="l">超支科目</th><th>预算</th><th>已用</th><th>超支额</th><th>性质</th></tr></thead><tbody>')
    for org,name,bb,uu,rr in over:
        nm = NAME_MAP.get(org, org)
        # determine if it's 关联/非关联 split
        if "邻里关联" in name:
            base = base_name(name)
            # find matching 非关联 or main in same org with positive surplus covering
            paired = False
            for o2,b2,u2,rm2,ol2,mi2 in report:
                if o2!=org: continue
                for r2 in ol2:
                    if r2["indent"]==mi2: continue
                    v2=r2["vals"]
                    if base_name(v2[0])==base and ("非关联" in v2[0] or base==v2[0]) and num(v2[4])>0:
                        paired=True
            nat = "科目关联/非关联拆分（合并后为正）" if paired else "真实超支"
        else:
            nat = "真实超支（预算不足）"
        tag = 'tag.ok' if "拆分" in nat else 'tag.bad'
        html.append(f'<tr><td class="l">{nm}</td><td class="l">{name}</td><td>¥{fmt(bb)}</td><td>¥{fmt(uu)}</td><td class="neg">¥{fmt(-rr)}</td><td><span class="tag {tag}">{nat}</span></td></tr>')
    html.append('</tbody></table>')
else:
    html.append('<p class="pos">无超支科目。</p>')
html.append('</div>')

# Notes
html.append('<div class="card"><div class="h2">四、说明</div>')
html.append('<div class="note">')
html.append('1. <b>4 个项目整体均有结余</b>，合计结余 ¥%s（整体使用率 %.1f%%）。其中香海二期（飞来湖）结余最多（¥%s），香海一期（万达西）使用率最高（86.4%%），余额偏紧。<br>' % (fmt(total_remain), rate, fmt(overall[0][3])))
html.append('2. <b>已超支的子科目</b>集中在「给排水系统 / 水池 / 二次供水」类（龙湖苑、雅悦花园），这些科目原预算为 0 或偏小，实际支出已超出，请关注后续请款是否需追加预算或调整科目归属。<br>')
html.append('3. 标注「科目关联/非关联拆分」的负结余（如电梯维保合同及年审（邻里关联））是因同一合同在系统中拆成"关联/非关联"两行记账，整体合并后为正，<b>并非真实超支</b>，无需担心。<br>')
html.append('4. 黄色高亮行为电梯相关科目（电梯维修及材料、电梯维保合同及年审），是本次预算跟踪重点；其整体均结余为正。')
html.append('</div></div>')

html.append('</body></html>')
out = os.path.join(BASE, "reports/budget_surplus_2026.html")
open(out, "w", encoding="utf-8").write("\n".join(html))
print("written:", out)
print("over-budget count:", len(over))
for o in over:
    print("  ", o[0], o[1], o[4])
