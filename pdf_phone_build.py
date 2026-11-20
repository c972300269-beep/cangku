# -*- coding: utf-8 -*-
"""Build the final 145x105mm PDF (28 pages: 12 with new phone number) + image pack + preview."""
import os, re, json, zipfile
from PIL import Image
import pymupdf

BASE = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone"
SRC = os.path.join(BASE, "pages")
ED = os.path.join(BASE, "edited_v2")
OUT = os.path.join(BASE, "out")
JPG = os.path.join(OUT, "jpg")
os.makedirs(JPG, exist_ok=True)

MM_W, MM_H, DPI = 145, 105, 300
PX_W, PX_H = 1713, 1240

files = sorted([f for f in os.listdir(SRC) if re.match(r'^P\d+\.png$', f)])
recs = []
for f in files:
    rep = os.path.exists(os.path.join(ED, f))
    im = Image.open(os.path.join(ED if rep else SRC, f)).convert("RGB")
    if im.size != (PX_W, PX_H):
        im = im.resize((PX_W, PX_H), Image.LANCZOS)
    im.save(os.path.join(OUT, f), dpi=(DPI, DPI))
    im.save(os.path.join(JPG, f.replace(".png", ".jpg")), "JPEG", quality=92, dpi=(DPI, DPI), subsampling=0)
    recs.append({"page": f, "phone_replaced": rep})
    print(f, "replaced=" + str(rep), flush=True)

pw, ph = MM_W * 72 / 25.4, MM_H * 72 / 25.4
for tag, folder, ext in [("", OUT, ".png"), ("_轻量版", JPG, ".jpg")]:
    doc = pymupdf.open()
    for r in recs:
        p = doc.new_page(width=pw, height=ph)
        p.insert_image(pymupdf.Rect(0, 0, pw, ph), filename=os.path.join(folder, r["page"].replace(".png", ext)))
    o = os.path.join(OUT, "西区特种设备使用标志_145x105mm_电话已更新%s.pdf" % tag)
    doc.save(o, garbage=4, deflate=True); doc.close()
    print("PDF", os.path.basename(o), "%.1f MB" % (os.path.getsize(o) / 1048576), flush=True)

z = os.path.join(OUT, "西区特种设备使用标志_145x105mm_电话已更新_图片.zip")
with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for r in recs:
        zf.write(os.path.join(JPG, r["page"].replace(".png", ".jpg")), r["page"].replace(".png", ".jpg"))
print("ZIP %.1f MB" % (os.path.getsize(z) / 1048576))

cols, rows, tw, th = 7, 4, 340, 246
sheet = Image.new("RGB", (cols * tw + (cols + 1) * 10, rows * th + (rows + 1) * 10), "#e9edf2")
for i, r in enumerate(recs):
    t = Image.open(os.path.join(OUT, r["page"])); t.thumbnail((tw, th), Image.LANCZOS)
    rr, c = divmod(i, cols)
    sheet.paste(t, (10 + c * (tw + 10) + (tw - t.width) // 2, 10 + rr * (th + 10) + (th - t.height) // 2))
sheet.save(os.path.join(OUT, "预览_电话已更新_28页.png"))
print("PREVIEW ok; replaced =", sum(1 for r in recs if r["phone_replaced"]), "/", len(recs))
print("DONE")
