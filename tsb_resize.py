# -*- coding: utf-8 -*-
# Resize scans to exactly 145mm x 105mm (300dpi), keep aspect ratio, center on white.
import os, json, zipfile
from PIL import Image

SRC = r"E:\workbuddy\Claw\reports\tsb_badge\fixed"
OUT = r"E:\workbuddy\Claw\reports\tsb_badge\145x105"

MM_W, MM_H, DPI = 145, 105, 300
PX_W = int(round(MM_W / 25.4 * DPI))   # 1713
PX_H = int(round(MM_H / 25.4 * DPI))   # 1240

os.makedirs(OUT, exist_ok=True)
jpg_dir = os.path.join(OUT, "jpg")
os.makedirs(jpg_dir, exist_ok=True)

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png") and f.startswith("P")])
print("pages:", len(files))

info = []
for name in files:
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    w, h = im.size
    s = min(PX_W / w, PX_H / h)
    nw, nh = int(round(w * s)), int(round(h * s))
    rs = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (PX_W, PX_H), "white")
    canvas.paste(rs, ((PX_W - nw) // 2, (PX_H - nh) // 2))

    base = os.path.splitext(name)[0]
    p_png = os.path.join(OUT, base + ".png")
    canvas.save(p_png, dpi=(DPI, DPI))
    p_jpg = os.path.join(jpg_dir, base + ".jpg")
    canvas.save(p_jpg, "JPEG", quality=92, dpi=(DPI, DPI), subsampling=0)

    info.append({
        "page": base,
        "src": [w, h],
        "scale": round(s, 5),
        "placed": [nw, nh],
        "margin_px": [(PX_W - nw) // 2, (PX_H - nh) // 2],
        "out_px": [PX_W, PX_H],
    })
    print(base, "%dx%d -> %dx%d  scale=%.4f  margin=%d/%d px" % (w, h, nw, nh, s, (PX_W - nw) // 2, (PX_H - nh) // 2))

# PDF: page size 145 x 105 mm
try:
    import fitz  # PyMuPDF
    doc = fitz.open()
    pw, ph = MM_W * 72 / 25.4, MM_H * 72 / 25.4
    for name in files:
        base = os.path.splitext(name)[0]
        p = os.path.join(OUT, base + ".png")
        page = doc.new_page(width=pw, height=ph)
        page.insert_image(fitz.Rect(0, 0, pw, ph), filename=p)
    pdf_path = os.path.join(OUT, "西区特种设备使用标志_145x105mm.pdf")
    doc.save(pdf_path, garbage=4, deflate=True)
    doc.close()
    print("PDF OK:", pdf_path, os.path.getsize(pdf_path))
except Exception as e:
    print("PDF FAIL:", e)

# ZIP of PNGs
zpath = os.path.join(OUT, "西区特种设备使用标志_145x105mm_图片.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in files:
        base = os.path.splitext(name)[0]
        z.write(os.path.join(OUT, base + ".png"), base + ".png")
print("ZIP OK:", zpath, os.path.getsize(zpath))

with open(os.path.join(OUT, "尺寸调整记录.json"), "w", encoding="utf-8") as f:
    json.dump({"target_mm": [MM_W, MM_H], "dpi": DPI, "canvas_px": [PX_W, PX_H],
               "mode": "keep-aspect-center-on-white", "pages": info}, f, ensure_ascii=False, indent=2)

# contact sheet preview
cols, rows = 7, 4
tw, th = 340, 246
sheet = Image.new("RGB", (cols * tw + (cols + 1) * 10, rows * th + (rows + 1) * 10), "#e9edf2")
for i, name in enumerate(files):
    base = os.path.splitext(name)[0]
    im = Image.open(os.path.join(OUT, base + ".png"))
    im.thumbnail((tw, th), Image.LANCZOS)
    r, c = divmod(i, cols)
    sheet.paste(im, (10 + c * (tw + 10) + (tw - im.width) // 2, 10 + r * (th + 10) + (th - im.height) // 2))
pv = os.path.join(OUT, "预览_145x105mm_28页.png")
sheet.save(pv)
print("PREVIEW:", pv)
print("DONE")
