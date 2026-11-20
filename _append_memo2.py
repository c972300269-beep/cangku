# -*- coding: utf-8 -*-
import io
p = r"E:\workbuddy\Claw\.workbuddy\memory\2026-09-12.md"
txt = """

## 17:47-17:58 用户回传 145x105mm PDF，要求改电话（二次处理）
- 用户把 `西区特种设备使用标志_145x105mm.pdf` 发回（微信 inbound），要求把 18127418049 改为 0763-3867022
- PDF 规格确认：28 页、页面 145.00×105.00mm、内嵌图 1713×1240
- 流程：pymupdf 300dpi 提取每页 → RapidOCR 定位 → 列投影精修 → 替换 → 重排 145×105mm PDF
- 结果：12 页替换成功，16 页是 13535983438 保持原样（同上一轮）
- 两个新踩的坑：
  1. 列投影返回值是 `(x0,x1,y0,y1)`，我按 `[x0,y0,x1,y1]` 解包 → 框颠倒 → 中位色取空 → NaN 崩
  2. P04 号码下方有表格线，行投影取 min~max 把线并进来 → 字高 56px（其余 35px）→ 字号偏大 + 擦断线。
     修正：行投影只取**最高连续墨迹段** → 全部回到 35-37px
- 脚本：`.workbuddy/scripts/pdf_phone_extract.py` / `pdf_phone_run.py` / `pdf_phone_check.py` / `pdf_phone_build.py`
  （`replace_phone.py` 被 import 复用，已加 ring_color 空区域保护）
- 成品：`reports/tsb_badge/pdf_phone/out/`
  - 西区特种设备使用标志_145x105mm_电话已更新.pdf（50.3MB）
  - ..._轻量版.pdf（16.3MB）/ ..._图片.zip（15.7MB）/ 预览_电话已更新_28页.png
  - 复核条：`reports/tsb_badge/pdf_phone/check_phone_strip.png`
- skill `scanned-orientation` 已补两条坑（行投影取最高段、box 解包顺序）
"""
with io.open(p, "a", encoding="utf-8") as f:
    f.write(txt)
print("ok")
