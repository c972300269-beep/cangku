# -*- coding: utf-8 -*-
"""BPM 每日简报 → 企业微信群机器人（个人微信经微信插件同步可见）
从 bpm_data.json 生成精简 Markdown，按 2048 字节上限自动拆条推送。
用法: python wecom_push_brief.py
"""
import json
import re
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

WEBHOOK = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=0ea2603d-2bc8-4834-8684-eb8efe8fe0a0"
DATA_PATH = r"E:/workbuddy/Claw/.workbuddy/bpm_data.json"
MAX_BYTES = 2000  # 微信上限 2048，留余量

data = json.load(open(DATA_PATH, encoding="utf-8"))
ft = (data.get("fetch_time") or "")[:16].replace("T", " ")
ds = data.get("daishenpi_list", [])
sp = data.get("shenpizhong_list", [])
yt_total = data.get("yitongguo") or 0
yt_list = data.get("yitongguo_list", [])


def is_info(x):
    pt = x.get("ProcessType") or ""
    nd = x.get("NodeName") or ""
    keys = ("知会", "待知悉", "知悉", "传阅", "抄送")
    return any(k in pt for k in keys) or any(k in nd for k in keys)


def one(x, n):
    sn = x.get("SerialNum", "")
    desc = str(x.get("Description") or x.get("ProcessName") or "")[:46]
    return "%d. `%s` %s" % (n, sn, desc)


ds_todo = [x for x in ds if not is_info(x)]
ds_info = [x for x in ds if is_info(x)]

from collections import Counter

sec = []
sec.append("**📊 BPM每日简报 %s**" % ft)
sec.append("待审批 **%d** ｜ 待知悉 %d ｜ 审批中 %d ｜ 今年已通过 %d"
           % (len(ds_todo), len(ds_info), len(sp), yt_total))

if ds_todo:
    lines = ["**⚠️ 待审批 · 需你处理（%d 条）**" % len(ds_todo)]
    for i, x in enumerate(ds_todo, 1):
        lines.append(one(x, i))
    sec.append("\n".join(lines))

if ds_info:
    lines = ["**📨 待知悉 · 无需审批（%d 条）**" % len(ds_info)]
    for i, x in enumerate(ds_info, 1):
        lines.append(one(x, i))
    sec.append("\n".join(lines))

nodes = Counter((x.get("NodeName") or "未知节点") for x in sp)
if nodes:
    lines = ["**🔄 审批中 · 节点分布**"]
    for n, c in nodes.most_common(6):
        lines.append("%s：%d" % (n, c))
    sec.append("\n".join(lines))

recent = sorted(sp, key=lambda x: x.get("CreateTime") or "0000", reverse=True)[:5]
if recent:
    lines = ["**🆕 最近新增 Top5**"]
    for i, x in enumerate(recent, 1):
        lines.append(one(x, i))
    sec.append("\n".join(lines))

sec.append("📄 完整表格详见 QQ 邮箱《BPM每日简报》")


def send(text):
    body = json.dumps({"msgtype": "markdown", "markdown": {"content": text}}).encode("utf-8")
    req = urllib.request.Request(WEBHOOK, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        resp = json.loads(r.read().decode("utf-8"))
    if resp.get("errcode") != 0:
        raise RuntimeError("wecom: %s" % resp)
    return resp


ok = 0
for part in sec:
    buf, size = [], 0
    for line in part.split("\n"):
        lb = len(line.encode("utf-8")) + 1
        if size + lb > MAX_BYTES and buf:
            send("\n".join(buf))
            ok += 1
            time.sleep(1)
            buf, size = [], 0
        buf.append(line)
        size += lb
    if buf:
        send("\n".join(buf))
        ok += 1
        time.sleep(1)

print("WECOM_PUSH_OK parts=%d" % ok)
