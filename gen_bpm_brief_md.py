import json
import sys
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


def is_info(x):
    """待知悉/知会类：只需阅，不需要审批"""
    pt = x.get("ProcessType") or ""
    nd = x.get("NodeName") or ""
    keys = ("知会", "待知悉", "知悉", "传阅", "抄送")
    return any(k in pt for k in keys) or any(k in nd for k in keys)


ds_todo = [x for x in ds if not is_info(x)]
ds_info = [x for x in ds if is_info(x)]
ds_n = len(ds_todo)

out = []
out.append("# 📊 BPM 每日审批简报")
out.append("")
out.append("**数据时间：** " + ft)
out.append("")
out.append("## 概览")
out.append("- ⚠️ 待审批 / 需处理：**%d** 条" % ds_n)
out.append("- 📢 待知悉：**%d** 条" % len(ds_info))
out.append("- 🔵 审批中：**%d** 条" % sp_n)
out.append("- ✅ 已通过（今年）：**%d** 条" % yt_total)
out.append("")

out.append("## ⚠️ 待审批 · 需你处理（%d 条）" % ds_n)
if ds_todo:
    out.append("")
    out.append("| # | 单号 | 内容 | 当前节点 | 发起人 |")
    out.append("|---|---|---|---|---|")
    for i, x in enumerate(ds_todo, 1):
        sn = x.get("SerialNum", "")
        desc = x.get("Description") or x.get("ProcessName") or ""
        node = x.get("NodeName", "")
        owner = x.get("OwnerShortName") or x.get("OwnerDisplayName") or ""
        out.append("| %d | `%s` | %s | %s | %s |" % (i, sn, desc, node, owner))
    out.append("")
else:
    out.append("")
    out.append("✅ 今日没有需要你审批的流程")
    out.append("")

if ds_info:
    out.append("## 📢 待知悉 · 无需审批（%d 条）" % len(ds_info))
    out.append("")
    out.append("> 仅为知会/传阅，不需要点\"同意\"，抽空阅知即可")
    out.append("")
    out.append("| # | 单号 | 内容 | 发起人 | 送达时间 |")
    out.append("|---|---|---|---|---|")
    for i, x in enumerate(ds_info, 1):
        sn = x.get("SerialNum", "")
        desc = (x.get("Description") or x.get("ProcessName") or "")[:60]
        owner = x.get("OwnerShortName") or x.get("OwnerDisplayName") or ""
        t = (x.get("ReceiveTime") or x.get("CreateTime") or "")[:10]
        out.append("| %d | `%s` | %s | %s | %s |" % (i, sn, desc, owner, t))
    out.append("")

out.append("## 🔵 审批中 · 按当前节点分布")
out.append("")
nodes = Counter()
for x in sp:
    nodes[(x.get("NodeName") or "未知节点")] += 1
out.append("| 当前节点 | 数量 |")
out.append("|---|---|")
for n, c in nodes.most_common():
    out.append("| %s | %d |" % (n, c))
out.append("")

out.append("## 🔵 审批中 · 流程明细（%d 条）" % len(sp))
if sp:
    out.append("")
    sps_all = sorted(sp, key=lambda x: x.get("CreateTime") or "0000", reverse=True)
    out.append("| # | 单号 | 内容 | 当前节点 | 处理人 | 创建时间 |")
    out.append("|---|---|---|---|---|---|")
    for i, x in enumerate(sps_all, 1):
        sn = x.get("SerialNum", "")
        desc = (x.get("Description") or x.get("ProcessName") or "")[:50]
        node = x.get("NodeName", "")
        rec = x.get("RecipientShortName", "")
        t = (x.get("CreateTime") or "")[:10]
        out.append("| %d | `%s` | %s | %s | %s | %s |" % (i, sn, desc, node, rec, t))
    out.append("")
else:
    out.append("")
    out.append("无审批中流程")
    out.append("")

out.append("## 📥 最近新增（Top 10）")
out.append("")


def ct(x):
    return x.get("CreateTime") or "0000"


sps = sorted(sp, key=ct, reverse=True)[:10]
out.append("| # | 日期 | 单号 | 内容 |")
out.append("|---|---|---|---|")
for i, x in enumerate(sps, 1):
    sn = x.get("SerialNum", "")
    desc = (x.get("Description") or x.get("ProcessName") or "")[:60]
    t = (x.get("CreateTime") or "")[:10]
    out.append("| %d | %s | `%s` | %s |" % (i, t, sn, desc))
out.append("")

qk_list = [x for x in yt_list if "请款" in (x.get("ProcessName") or "")]
if qk_list:
    qk_top = sorted(qk_list, key=lambda x: x.get("CreateTime") or "0000", reverse=True)[:20]
    out.append("## ✅ 已通过 · 最近请款 %d 条" % len(qk_top))
    out.append("")
    out.append("今年累计已通过 **%d** 条；下表仅列最近请款类流程" % yt_total)
    out.append("")
    out.append("| # | 单号 | 类型 | 内容 | 创建时间 |")
    out.append("|---|---|---|---|---|")
    for i, x in enumerate(qk_top, 1):
        sn = x.get("SerialNum", "")
        ptype = (x.get("ProcessName") or "").replace("邻里-", "")
        desc = (x.get("Description") or "")[:50]
        t = (x.get("CreateTime") or "")[:10]
        out.append("| %d | `%s` | %s | %s | %s |" % (i, sn, ptype, desc, t))
    out.append("")
else:
    out.append("## ✅ 已通过")
    out.append("")
    out.append("今年累计已通过 **%d** 条；最近没有已通过的请款流程" % yt_total)
    out.append("")

print("\n".join(out))
