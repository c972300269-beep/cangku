# -*- coding: utf-8 -*-
"""Inspect the incoming PDF and extract each page as a 300dpi image for editing."""
import os, json
import pymupdf

PDF = r"C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-60a074544ac6d370-西区特种设备使用标志_145x105mm.pdf"
OUT = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone\pages"
os.makedirs(OUT, exist_ok=True)

doc = pymupdf.open(PDF)
print("pages:", doc.page_count)
p0 = doc[0]
print("page mm: %.2f x %.2f" % (p0.rect.width * 25.4 / 72, p0.rect.height * 25.4 / 72))
imgs = p0.get_images(full=True)
print("page0 images:", [(i[0], i[2], i[3]) for i in imgs])

meta = {"pdf": os.path.basename(PDF), "pages": doc.page_count,
        "page_mm": [round(p0.rect.width * 25.4 / 72, 2), round(p0.rect.height * 25.4 / 72, 2)],
        "items": []}
for i in range(doc.page_count):
    pg = doc[i]
    pix = pg.get_pixmap(dpi=300, colorspace=pymupdf.csRGB)
    fn = os.path.join(OUT, "P%02d.png" % (i + 1))
    pix.save(fn)
    meta["items"].append({"page": i + 1, "px": [pix.width, pix.height], "file": fn})
    print("P%02d" % (i + 1), pix.width, "x", pix.height)
doc.close()
json.dump(meta, open(os.path.join(os.path.dirname(OUT), "extract.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("DONE")
