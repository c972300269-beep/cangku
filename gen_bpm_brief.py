import json
import sys
import html
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

path = r"E:/workbuddy/Claw/.workbuddy/bpm_data.json"
data = json.load(open(path, encoding="utf-8"))
ft = (data.get("fetch_time") or "")[:16].replace("T", " ")
ds = data.get("daishenpi_list", [])
sp = data.get("shenpizhong_list", [])
ds_n = data.get("daishenpi") or 0
sp_n = data.get("shenpizhong") or 0
yt_total = data.get("yitongguo") or 0
yt_list = data.get("yitongguo_list", [])


def e(s):
    return html.escape(str(s if s is not None else ""))


def is_info(x):
    """待知悉/知会类：只需阅，不需要审批"""
    pt = x.get("ProcessType") or ""
    nd = x.get("NodeName") or ""
    keys = ("知会", "待知悉", "知悉", "传阅", "抄送")
    return any(k in pt for k in keys) or any(k in nd for k in keys)


import re

_AMT_PATS = [
    re.compile(r"[（(](?:智通|同国)[：:]?\s*([\d,，.]+)"),
    re.compile(r"金额[：:]?\s*([\d,，.]+)"),
    re.compile(r"[¥￥]\s*([\d,，.]+)"),
    re.compile(r"([\d,，]+\.\d+)\s*元"),
    re.compile(r"([\d,，]+)\s*元"),
]


def extract_amount(desc, sn=None):
    """从流程标题提取请款金额；提不到则查缓存（bpm_fetch_amounts.js 开表单补抓的结果）"""
    s = str(desc or "")
    for p in _AMT_PATS:
        m = p.search(s)
        if m:
            raw = m.group(1).replace("，", ",")
            try:
                v = float(raw.replace(",", ""))
                return "{:,.2f}".format(v).rstrip("0").rstrip(".")
            except ValueError:
                continue
    if sn:
        c = _AMT_CACHE.get(str(sn))
        if c and c.get("amount") is not None:
            v = float(c["amount"])
            return "{:,.2f}".format(v).rstrip("0").rstrip(".")
    return None


# 金额缓存（由 bpm_fetch_amounts.js 维护：标题带金额直接入库，其余开表单补抓，每日简报前增量运行）
try:
    import json as _json
    with open(r"E:/workbuddy/Claw/.workbuddy/bpm_output/qingkuan_amounts.json", encoding="utf-8") as _f:
        _AMT_CACHE = _json.load(_f)
except Exception:
    _AMT_CACHE = {}


# 拆分：真正要你审批的 vs 只是知会你的
ds_todo = [x for x in ds if not is_info(x)]
ds_info = [x for x in ds if is_info(x)]
ds_n = len(ds_todo)


TD = "padding:8px 10px;border-bottom:1px solid #eef1f5;font-size:13px;vertical-align:top;color:#333;"
TH = "padding:8px 10px;background:#f5f7fa;text-align:left;font-size:12px;color:#5b6472;font-weight:600;border-bottom:2px solid #e3e8ef;white-space:nowrap;"
CODE = "background:#f2f4f7;padding:1px 5px;border-radius:4px;font-size:12px;color:#3a4a5f;"

out = []
out.append('<div style="font-family:-apple-system,BlinkMacSystemFont,\'Microsoft YaHei\',Arial,sans-serif;max-width:700px;margin:0 auto;color:#222;background:#ffffff;padding:4px;">')
out.append('<h2 style="margin:0 0 4px;font-size:20px;color:#1a1a1a;">&#128202; BPM 每日审批简报</h2>')
out.append('<p style="margin:0 0 18px;color:#8a8f99;font-size:12px;">数据时间：' + e(ft) + '</p>')

# 概览卡片
out.append('<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:22px;"><tr>')
cards = [("待审批 / 需处理", ds_n, "#e67e22"), ("待知悉", len(ds_info), "#8e6bbf"), ("审批中", sp_n, "#2f80ed"), ("已通过（今年）", yt_total, "#27ae60")]
for label, val, color in cards:
    out.append('<td style="width:25%;background:#f8fafc;border:1px solid #e8edf5;border-radius:8px;padding:14px 6px;text-align:center;">'
               '<div style="font-size:12px;color:#7b8393;margin-bottom:6px;">' + label + '</div>'
               '<div style="font-size:24px;font-weight:700;color:' + color + ';">' + e(val) + '</div></td>')
out.append('</tr></table>')

# 待审批（仅真正需要点"同意"的）
out.append('<h3 style="font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #e67e22;color:#333;">&#9888;&#65039; 待审批 · 需你处理（' + e(ds_n) + ' 条）</h3>')
if ds_todo:
    out.append('<table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5;">')
    out.append('<tr><th style="' + TH + '">#</th><th style="' + TH + '">单号</th><th style="' + TH + '">内容</th><th style="' + TH + '">当前节点</th><th style="' + TH + '">发起人</th></tr>')
    for i, x in enumerate(ds_todo, 1):
        sn = e(x.get("SerialNum", ""))
        desc = e(x.get("Description") or x.get("ProcessName", ""))
        node = e(x.get("NodeName", ""))
        owner = e(x.get("OwnerShortName") or x.get("OwnerDisplayName") or "")
        out.append('<tr><td style="' + TD + '">' + str(i) + '</td>'
                   '<td style="' + TD + '"><span style="' + CODE + '">' + sn + '</span></td>'
                   '<td style="' + TD + '">' + desc + '</td>'
                   '<td style="' + TD + '">' + node + '</td>'
                   '<td style="' + TD + '">' + owner + '</td></tr>')
    out.append('</table>')
else:
    out.append('<p style="color:#27ae60;font-size:13px;margin:6px 0;">今日没有需要你审批的流程 &#9989;</p>')

# 待知悉（知会/传阅，无需审批）
if ds_info:
    out.append('<h3 style="font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #8e6bbf;color:#333;">&#128226; 待知悉 · 无需审批（' + e(len(ds_info)) + ' 条）</h3>')
    out.append('<p style="font-size:12px;color:#8a8f99;margin:0 0 8px;">仅为知会/传阅，不需要点"同意"，抽空阅知即可</p>')
    out.append('<table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5;">')
    out.append('<tr><th style="' + TH + '">#</th><th style="' + TH + '">单号</th><th style="' + TH + '">内容</th><th style="' + TH + '">发起人</th><th style="' + TH + '">送达时间</th></tr>')
    for i, x in enumerate(ds_info, 1):
        sn = e(x.get("SerialNum", ""))
        desc = e((x.get("Description") or x.get("ProcessName") or "")[:60])
        owner = e(x.get("OwnerShortName") or x.get("OwnerDisplayName") or "")
        t = e((x.get("ReceiveTime") or x.get("CreateTime") or "")[:10])
        out.append('<tr><td style="' + TD + '">' + str(i) + '</td>'
                   '<td style="' + TD + '"><span style="' + CODE + '">' + sn + '</span></td>'
                   '<td style="' + TD + '">' + desc + '</td>'
                   '<td style="' + TD + '">' + owner + '</td>'
                   '<td style="' + TD + '">' + t + '</td></tr>')
    out.append('</table>')

# 审批中节点分布
out.append('<h3 style="font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #2f80ed;color:#333;">&#128260; 审批中 · 按当前节点分布</h3>')
nodes = Counter()
for x in sp:
    nodes[(x.get("NodeName") or "未知节点")] += 1
out.append('<table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5;">')
out.append('<tr><th style="' + TH + '">当前节点</th><th style="' + TH + '">数量</th></tr>')
for n, c in nodes.most_common():
    out.append('<tr><td style="' + TD + '">' + e(n) + '</td><td style="' + TD + '">' + str(c) + '</td></tr>')
out.append('</table>')

# 审批中明细
out.append('<h3 style="font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #2f80ed;color:#333;">&#128203; 审批中 · 流程明细（' + str(len(sp)) + ' 条）</h3>')
if sp:
    sps_all = sorted(sp, key=lambda x: x.get("CreateTime") or "0000", reverse=True)
    out.append('<table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5;">')
    out.append('<tr><th style="' + TH + '">#</th><th style="' + TH + '">单号</th><th style="' + TH + '">内容</th><th style="' + TH + '">请款金额</th><th style="' + TH + '">当前节点</th><th style="' + TH + '">处理人</th><th style="' + TH + '">创建时间</th></tr>')
    for i, x in enumerate(sps_all, 1):
        sn = e(x.get("SerialNum", ""))
        desc_raw = x.get("Description") or x.get("ProcessName") or ""
        desc = e(desc_raw[:50])
        amt = extract_amount(desc_raw, x.get("SerialNum"))
        amt_html = ('<span style="color:#e67e22;font-weight:600;">¥ ' + e(amt) + '</span>') if amt else '<span style="color:#c3c9d2;">—</span>'
        node = e(x.get("NodeName", ""))
        rec = e(x.get("RecipientShortName", ""))
        t = e((x.get("CreateTime") or "")[:10])
        out.append('<tr><td style="' + TD + '">' + str(i) + '</td>'
                   '<td style="' + TD + '"><span style="' + CODE + '">' + sn + '</span></td>'
                   '<td style="' + TD + '">' + desc + '</td>'
                   '<td style="' + TD + '">' + amt_html + '</td>'
                   '<td style="' + TD + '">' + node + '</td>'
                   '<td style="' + TD + '">' + rec + '</td>'
                   '<td style="' + TD + '">' + t + '</td></tr>')
    out.append('</table>')
    out.append('<p style="font-size:11px;color:#aab2bd;margin:6px 0 0;">注：金额取自流程标题标注或表单补抓结果；仍显示"—"的为表单中未识别到金额。</p>')
else:
    out.append('<p style="color:#8a8f99;font-size:13px;margin:6px 0;">无审批中流程</p>')

# 最近新增
out.append('<h3 style="font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #8e44ad;color:#333;">&#127381; 最近新增（Top 10）</h3>')


def ct(x):
    return x.get("CreateTime") or "0000"


sps = sorted(sp, key=ct, reverse=True)[:10]
out.append('<table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5;">')
out.append('<tr><th style="' + TH + '">#</th><th style="' + TH + '">日期</th><th style="' + TH + '">单号</th><th style="' + TH + '">内容</th></tr>')
for i, x in enumerate(sps, 1):
    sn = e(x.get("SerialNum", ""))
    desc = e((x.get("Description") or x.get("ProcessName") or "")[:60])
    t = e((x.get("CreateTime") or "")[:10])
    out.append('<tr><td style="' + TD + '">' + str(i) + '</td>'
               '<td style="' + TD + '">' + t + '</td>'
               '<td style="' + TD + '"><span style="' + CODE + '">' + sn + '</span></td>'
               '<td style="' + TD + '">' + desc + '</td></tr>')
out.append('</table>')

# 已通过（只展示最近请款类流程）
qk_list = [x for x in yt_list if "请款" in (x.get("ProcessName") or "")]
if qk_list:
    qk_top = sorted(qk_list, key=lambda x: x.get("CreateTime") or "0000", reverse=True)[:20]
    out.append('<h3 style="font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #27ae60;color:#333;">&#9989; 已通过 · 最近请款 ' + str(len(qk_top)) + ' 条</h3>')
    out.append('<p style="font-size:13px;color:#444;margin:6px 0;">今年累计已通过 <b>' + e(yt_total) + '</b> 条；下表仅列最近请款类流程</p>')
    out.append('<table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5;">')
    out.append('<tr><th style="' + TH + '">#</th><th style="' + TH + '">单号</th><th style="' + TH + '">类型</th><th style="' + TH + '">内容</th><th style="' + TH + '">创建时间</th></tr>')
    for i, x in enumerate(qk_top, 1):
        sn = e(x.get("SerialNum", ""))
        ptype = e((x.get("ProcessName") or "").replace("邻里-", ""))
        desc = e((x.get("Description") or "")[:50])
        t = e((x.get("CreateTime") or "")[:10])
        out.append('<tr><td style="' + TD + '">' + str(i) + '</td>'
                   '<td style="' + TD + '"><span style="' + CODE + '">' + sn + '</span></td>'
                   '<td style="' + TD + '">' + ptype + '</td>'
                   '<td style="' + TD + '">' + desc + '</td>'
                   '<td style="' + TD + '">' + t + '</td></tr>')
    out.append('</table>')
else:
    out.append('<h3 style="font-size:15px;margin:22px 0 8px;padding-left:10px;border-left:4px solid #27ae60;color:#333;">&#9989; 已通过</h3>')
    out.append('<p style="font-size:13px;color:#444;margin:6px 0;">今年累计已通过 <b>' + e(yt_total) + '</b> 条；最近没有已通过的请款流程</p>')

out.append('<p style="margin-top:26px;padding-top:12px;border-top:1px solid #eef1f5;font-size:11px;color:#aab2bd;">本邮件由 BPM 简报自动推送生成</p>')
out.append('</div>')

print("\n".join(out))
