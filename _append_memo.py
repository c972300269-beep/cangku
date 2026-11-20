# -*- coding: utf-8 -*-
import io, os
p = r"E:\workbuddy\Claw\.workbuddy\memory\2026-09-12.md"
txt = """

## 17:13-17:45 西区特种设备使用标志 — 替换应急救援电话
- 需求：把标志上的 18127418049 改为 0763-3867022，位置格式不变
- 号码不在任何文档里，是**印在扫描件图片上**的（先用 node 脚本全盘搜文本无果 → 改 OCR）
- OCR 全量扫描 28 页，发现号码**有两种**：
  - 18127418049 → 12 页（P01/02/04/06/07/13/14/20/22/23/26/28）→ 已替换
  - 13535983438 → 16 页（P03/05/08/09/10/11/12/15/16/17/18/19/21/24/25/27）→ 保持原样，待用户确认
  - 位置统一：「应急救援电话：xxx」，行 box y≈1050-1180，号码 x≈1600-2020
- 技术：RapidOCR 定位行 → 列投影精修号码 bbox → 取外扩环中位色填充 → 黑体 4x 渲染裁 ink
  → resize 到原号码宽x高（端点对齐）→ alpha 混回
- 脚本：`.workbuddy/scripts/ocr_all_phone.py`（定位，输出 reports/tsb_badge/phone_boxes.json）、
  `replace_phone.py`（sample/run）、`phone_check_strip.py`（复核条）、`phone_final.py`（出成品）
- 成品：reports/tsb_badge/phone_fixed/（28 页 x 145x105mm @300dpi）
  - 电话已更新.pdf 49.1MB / 轻量版 16.3MB / 图片.zip 15.8MB / 预览图
  - 复核条：reports/tsb_badge/check_phone_strip.png
- 中间产物：reports/tsb_badge/edited/（12 页替换后原尺寸图）
- 已更新 skill scanned-orientation：新增「扫描件里的文字替换」章节
- 环境：bash 的 PATH 已坏（tail/head 找不到、cd null directory），PowerShell stdout 也回传不出来
  → 统一用 node/python 绝对路径直接跑脚本
"""
with io.open(p, "a", encoding="utf-8") as f:
    f.write(txt)
print("appended", os.path.getsize(p), "bytes")
