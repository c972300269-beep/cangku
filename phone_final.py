# -*- coding: utf-8 -*-
"""Final deliverable: 28 pages (12 with replaced phone + 16 untouched) at 145x105mm, 300dpi."""
import os, re, json, zipfile
import numpy as np
import cv2
from PIL import Image
import pymupdf

BASE = r"E:\workbuddy\Claw\reports\tsb_badge"
SRC = os.path.join(BASE, "fixed")
ED = os.path.join(BASE, "edited")
OUT = os.path.join(BASE, "phone_fixed")
JPG = os.path.join(OUT, "jpg")
os.makedirs(JPG, exist_ok=True)

MM_W, MM_H, DPI = 145, 105, 300
PX_W, PX_H = 1713, 1240                     # 145mm x 105mm @300dpi

files = sorted([f for f in os.listdir(SRC) if re.match(r'^P\d+\.png$', f)])
records = []
for f in files:
    use_edited = os.path.exists(os.path.join(ED, f))
    src = os.path.join(ED if use_edited else SRC, f)
    im = Image.open(src).convert("RGB")
    w, h = im.size
    s = min(PX_W / w, PX_H / h)
    nw, nh = int(round(w * s)), int(round(h * s))
    rs = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (PX_W, PX_H), "white")
    canvas.paste(rs, ((PX_W - nw) // 2, (PX_H - nh) // 2))
    base = os.path.splitext(f)[0]
    canvas.save(os.path.join(OUT, base + ".png"), dpi=(DPI, DPI))
    canvas.save(os.path.join(JPG, base + ".jpg"), "JPEG", quality=92, dpi=(DPI, DPI), subsampling=0)
    records.append({"page": base, "phone_replaced": use_edited})
    print(base, "phone_replaced=" + str(use_edited), flush=True)

n_rep = sum(1 for r in records if r["phone_replaced"])
print("replaced pages:", n_rep, "/", len(records))

pw, ph = MM_W * 72 / 25.4, MM_H * 72 / 25.4
for tag, folder in [("", OUT), ("_轻量版", JPG)]:
    doc = pymupdf.open()
    for r in records:
        p = doc.new_page(width=pw, height=ph)
        fn = os.path.join(folder, r["page"] + (".jpg" if folder == JPG else ".png"))
        p.insert_image(pymupdf.Rect(0, 0, pw, ph), filename=fn)
    out = os.path.join(OUT, "西区特种设备使用标志_145x105mm_电话已更新%s.pdf" % tag)
    doc.save(out, garbage=4, deflate=True)
    doc.close()
    print("PDF:", os.path.basename(out), "%.1f MB" % (os.path.getsize(out) / 1048576), flush=True)

zpath = os.path.join(OUT, "西区特种设备使用标志_145x105mm_电话已更新_图片.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for r in records:
        z.write(os.path.join(JPG, r["page"] + ".jpg"), r["page"] + ".jpg")
print("ZIP: %.1f MB" % (os.path.getsize(zpath) / 1048576))

cols, rows = 7, 4
tw, th = 340, 246
sheet = Image.new("RGB", (cols * tw + (cols + 1) * 10, rows * th + (rows + 1) * 10), "#e9edf2")
for i, r in enumerate(records):
    im = Image.open(os.path.join(OUT, r["page"] + ".png"))
    im.thumbnail((tw, th), Image.LANCZOS)
    rr, c = divmod(i, cols)
    sheet.paste(im, (10 + c * (tw + 10) + (tw - im.width) // 2, 10 + rr * (th + 10) + (th - im.height) // 2))
sheet.save(os.path.join(OUT, "预览_电话已更新_28页.png"))
print("PREVIEW ok")

json.dump({"target_mm": [MM_W, MM_H], "dpi": DPI, "old": "18127418049", "new": "0763-3867022",
           "note": "仅替换 18127418049；13535983438 保持原样",
           "pages": records},
          open(os.path.join(OUT, "更新记录.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("DONE")
