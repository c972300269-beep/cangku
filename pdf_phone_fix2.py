# -*- coding: utf-8 -*-
"""Second pass: correct outlier glyph heights (median calibration) and re-render.

No OCR needed - the boxes from pdf_phone_final.py are reused, so this is fast.
An outlier height means the row projection swallowed something (a rule line glued to the
digits), which both inflates the font and pushes the clamped left edge too far left.
"""
import os, json, statistics
import numpy as np
import cv2

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replace_phone import replace_one, read

BASE = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone"
SRC = os.path.join(BASE, "pages")
ED = os.path.join(BASE, "edited_v2")
LOG = os.path.join(BASE, "replace_log_v2.json")
FONT = r"C:\Windows\Fonts\arialn.ttf"
NEW = "0763-3867022"
WIDTH_FACTOR = 6.05

log = json.load(open(LOG, encoding="utf-8"))
recs = [p for p in log["pages"] if p.get("status") == "replaced" and p.get("box")]
heights = [p["box"][3] - p["box"][1] for p in recs]
H_med = statistics.median(heights)
print("heights:", sorted(heights), "median =", H_med)

LIMIT = H_med * 1.15
fixed = []
for p in recs:
    x0, y0, x1, y1 = p["box"]
    h = y1 - y0
    if h > LIMIT:
        y0 = int(round(y1 - H_med))
        p["height_corrected_from"] = h
        print("  correct %s : h %d -> %d" % (p["page"], h, H_med), flush=True)
    left_proj = p.get("left_projection")
    left_clamp = x1 - WIDTH_FACTOR * (y1 - y0)
    x0 = int(round(min(left_proj, left_clamp))) if left_proj else x0
    p["box_final"] = [x0, y0, x1, y1]
    p["left_used"] = x0
    p["left_clamp_final"] = round(left_clamp, 1)
    fixed.append(p)

for p in fixed:
    img = read(os.path.join(SRC, p["page"]))
    out, meta = replace_one(img, p["box_final"], NEW, font=FONT)
    cv2.imencode('.png', out)[1].tofile(os.path.join(ED, p["page"]))
    p["font_used"] = os.path.basename(meta[0]) if meta else None
    p["final_wh"] = [p["box_final"][2] - p["box_final"][0], p["box_final"][3] - p["box_final"][1]]
    print(p["page"], "final box", p["box_final"], "w=%d h=%d" % tuple(p["final_wh"]), flush=True)

json.dump(log, open(os.path.join(BASE, "replace_log_v2.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("DONE", len(fixed), "pages re-rendered; median h =", H_med)
