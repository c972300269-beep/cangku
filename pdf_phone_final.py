# -*- coding: utf-8 -*-
"""One-shot pass over all 28 pages: locate 应急救援电话, fix the left edge of the number box,
then replace BOTH known mobile numbers with 0763-3867022 using Arial Narrow (matches the
original glyph proportions far better than SimHei).

Why the left-edge fix: a leading "1" is a narrow glyph with a wide gap to the next digit
(~6.5px), which survived the small-gap merge and got dropped -> the erase window missed the
original "1" and the result looked like "10763-...". A CN mobile number is always
11 digits, and its width is ~6.05 x glyph height, so we clamp the left edge with that.
"""
import os, sys, json
import numpy as np
import cv2
from rapidocr_onnxruntime import RapidOCR

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replace_phone import replace_one, read

BASE = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone"
SRC = os.path.join(BASE, "pages")
ED = os.path.join(BASE, "edited_v2")
os.makedirs(ED, exist_ok=True)

NEW = "0763-3867022"
OLDS = ("18127418049", "13535983438")
FONT = r"C:\Windows\Fonts\arialn.ttf"        # Arial Narrow: digit w/h 0.526 vs original ~0.545
WIDTH_FACTOR = 6.05                          # 11-digit mobile: ink width / glyph height

def line_and_number(img):
    H, W = img.shape[:2]
    res, _ = ocr(img)
    line = None
    for box, txt, score in (res or []):
        t = txt.replace(" ", "")
        if "应急救援" in t or "救援电话" in t:
            line = (box, t, float(score)); break
    if line is None:
        return None
    box, txt, score = line
    xs = [b[0] for b in box]; ys = [b[1] for b in box]
    lx0, ly0, lx1, ly1 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
    pad = 6
    crop = img[max(0, ly0 - pad):min(H, ly1 + pad), max(0, lx0 - pad):min(W, lx1 + pad)]
    g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = bw.shape
    cols = (bw > 0).sum(axis=0)
    ink = cols > max(2, int(h * 0.02))
    runs, s = [], None
    for i, v in enumerate(ink):
        if v and s is None: s = i
        elif not v and s is not None:
            if i - s > w * 0.01: runs.append([s, i])
            s = None
    if s is not None and w - s > w * 0.01: runs.append([s, w])
    if not runs:
        return None
    merged = [list(runs[0])]
    for r in runs[1:]:
        if r[0] - merged[-1][1] < w * 0.012: merged[-1][1] = r[1]
        else: merged.append(list(r))
    rx0, rx1 = merged[-1]
    # glyph height = tallest continuous ink band inside those columns
    ink_rows = (bw[:, rx0:rx1] > 0).sum(axis=1) > 0
    segs, s = [], None
    for i, v in enumerate(ink_rows):
        if v and s is None: s = i
        elif not v and s is not None: segs.append((s, i)); s = None
    if s is not None: segs.append((s, len(ink_rows)))
    if not segs:
        return None
    ry0, ry1 = max(segs, key=lambda t: t[1] - t[0])
    # absolute coords (crop was scaled 2x)
    nx1 = lx0 - pad + rx1 / 2.0
    gh = (ry1 - ry0) / 2.0
    nx0_proj = lx0 - pad + rx0 / 2.0
    nx0_clamp = nx1 - WIDTH_FACTOR * gh
    nx0 = min(nx0_proj, nx0_clamp)
    ny0 = ly0 - pad + ry0 / 2.0
    ny1 = ly0 - pad + ry1 / 2.0
    box = [int(round(nx0)), int(round(ny0)), int(round(nx1)), int(round(ny1))]
    return box, txt, round(score, 3), round(nx0_clamp, 1), round(nx0_proj, 1)

files = sorted([f for f in os.listdir(SRC) if f.endswith(".png")])
ocr = RapidOCR()
log = {"new": NEW, "font": os.path.basename(FONT), "width_factor": WIDTH_FACTOR, "pages": []}
done, other, bad = [], [], []
for f in files:
    img = read(os.path.join(SRC, f))
    r = line_and_number(img)
    if r is None:
        bad.append(f); log["pages"].append({"page": f, "status": "not_found"}); print(f, "NOT_FOUND", flush=True); continue
    box, txt, score, nx0c, nx0p = r
    rec = {"page": f, "text": txt, "box": box, "score": score,
           "left_clamped": nx0c, "left_projection": nx0p, "w": box[2] - box[0], "h": box[3] - box[1]}
    if any(o in txt for o in OLDS):
        out, meta = replace_one(img, box, NEW, font=FONT)
        cv2.imencode('.png', out)[1].tofile(os.path.join(ED, f))
        rec["status"] = "replaced"
        rec["font_used"] = os.path.basename(meta[0]) if meta else None
        done.append(f)
        print(f, "OK", txt, box, "w=%d h=%d" % (box[2] - box[0], box[3] - box[1]),
              "clamp=%.1f proj=%.1f" % (nx0c, nx0p), flush=True)
    else:
        rec["status"] = "other_text"
        other.append(f)
        print(f, "OTHER", txt, flush=True)
    log["pages"].append(rec)

json.dump(log, open(os.path.join(BASE, "replace_log_v2.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("REPLACED=%d OTHER=%d NOT_FOUND=%d" % (len(done), len(other), len(bad)))
print("not_found:", bad)
print("DONE")
