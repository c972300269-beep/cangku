# -*- coding: utf-8 -*-
"""分析 CRM 我创建的工单：按项目/年度统计，筛体检、专项、大中修相关"""
import json, re
from collections import Counter, defaultdict

p = r"E:/workbuddy/Claw/reports/crm_explore/GetCRMCreateList_all.json"
d = json.load(open(p, encoding="utf-8"))
rows = d.get("Content") or []
print("总条数:", d.get("Total"), "实取:", len(rows))

PROJ = {
    "香海一期/万达西": ["万达西"],
    "香海二期/恒达": ["恒达", "香海彼岸（清远）二期", "香海彼岸(清远)二期"],
    "龙湖苑一期": ["龙湖苑"],
    "雅悦花园": ["雅悦"],
}

def proj_of(s):
    for k, kws in PROJ.items():
        for kw in kws:
            if kw in s:
                return k
    return "其他/未识别"

# 年份分布
years = Counter((r.get("CreateAt") or "")[:4] for r in rows)
print("年份分布:", dict(sorted(years.items())))

# 类型分布（2026年）
t2026 = [r for r in rows if (r.get("CreateAt") or "").startswith("2026")]
print("\n2026 年:", len(t2026), "条")
print("类型分布:", Counter(r.get("ProcessType") for r in t2026).most_common(12))

# 项目分布（2026年）
pc = Counter(proj_of((r.get("Title") or "") + (r.get("Description") or "")) for r in t2026)
print("项目分布:", pc.most_common())

# 关键词命中
KW = ["体检", "专项", "网格化", "大中修", "维修资金", "预算"]
print("\n=== 关键词命中（全量） ===")
for kw in KW:
    hit = [r for r in rows if kw in ((r.get("Title") or "") + (r.get("Description") or ""))]
    print(f"[{kw}] {len(hit)} 条")
    for r in hit[:8]:
        print("   ", r.get("CreateAt"), "|", r.get("SerialNum"), "|", (r.get("Title") or "")[:70])
