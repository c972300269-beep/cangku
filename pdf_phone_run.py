# -*- coding: utf-8 -*-
"""OCR-locate 应急救援电话 on the 145x105mm PDF pages and replace 18127418049 -> 0763-3867022."""
import os, sys, json
import numpy as np
import cv2
from rapidocr_onnxruntime import RapidOCR

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replace_phone import replace_one, read

BASE = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone"
SRC = os.path.join(BASE, "pages")
ED = os.path.join(BASE, "edited")
os.makedirs(ED, exist_ok=True)

OLD = sys.argv[1] if len(sys.argv) > 1 else "18127418049"
NEW = sys.argv[2] if len(sys.argv) > 2 else "0763-3867022"

def col_runs_rightmost(crop):
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
    if s is not None: runs.append([s, w])
    if not runs: return None
    merged = [list(runs[0])]
    for r in runs[1:]:
        if r[0] - merged[-1][1] < w * 0.012: merged[-1][1] = r[1]
        else: merged.append(list(r))
    x0, x1 = merged[-1]
    # row projection inside the number columns -> keep the TALLEST continuous ink band.
    # (a rule/underline underneath would otherwise inflate the digit height)
    ink_rows = (bw[:, x0:x1] > 0).sum(axis=1) > 0
    segs, s = [], None
    for i, v in enumerate(ink_rows):
        if v and s is None: s = i
        elif not v and s is not None: segs.append((s, i)); s = None
    if s is not None: segs.append((s, len(ink_rows)))
    if not segs: return None
    y0, y1 = max(segs, key=lambda t: t[1] - t[0])
    return (x0 / 2.0, x1 / 2.0, y0 / 2.0, y1 / 2.0)

files = sorted([f for f in os.listdir(SRC) if f.endswith(".png")])
ocr = RapidOCR()
rec_all = {"old": OLD, "new": NEW, "pages": []}
changed, other, none = [], [], []

for f in files:
    img = read(os.path.join(SRC, f))
    H, W = img.shape[:2]
    res, _ = ocr(img)
    line = None
    for box, txt, score in (res or []):
        if "应急救援" in txt.replace(" ", "") or "救援电话" in txt.replace(" ", ""):
            line = (box, txt.replace(" ", ""), float(score)); break
    if line is None:
        none.append(f); print(f, "NO_LINE", flush=True)
        rec_all["pages"].append({"page": f, "status": "no_line"}); continue
    box, txt, score = line
    xs = [b[0] for b in box]; ys = [b[1] for b in box]
    x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
    pad = 6
    crop = img[max(0, y0 - pad):min(H, y1 + pad), max(0, x0 - pad):min(W, x1 + pad)]
    nb = col_runs_rightmost(crop)
    if nb is None:
        none.append(f); print(f, "NO_NUMBOX", flush=True)
        rec_all["pages"].append({"page": f, "status": "no_numbox", "text": txt}); continue
    nx0, nx1, ny0, ny1 = nb                       # col_runs_rightmost returns (x0, x1, y0, y1)
    nb_abs = [int(x0 - pad + nx0), int(y0 - pad + ny0), int(x0 - pad + nx1), int(y0 - pad + ny1)]
    num_box = [max(0, nb_abs[0]), max(0, nb_abs[1]), min(W, nb_abs[2]), min(H, nb_abs[3])]
    if num_box[2] - num_box[0] < 8 or num_box[3] - num_box[1] < 8:
        none.append(f); print(f, "BAD_BOX", nb_abs, "img", img.shape, flush=True)
        rec_all["pages"].append({"page": f, "status": "bad_box", "text": txt, "box": nb_abs}); continue
    rec = {"page": f, "text": txt, "num_box": num_box, "score": round(score, 3)}
    if OLD in txt:
        out, meta = replace_one(img, num_box, NEW)
        cv2.imencode('.png', out)[1].tofile(os.path.join(ED, f))
        rec["status"] = "replaced"
        rec["font"] = os.path.basename(meta[0]) if meta else None
        rec["out_wh"] = [meta[3], meta[4]] if meta else None
        changed.append(f)
        print(f, "REPLACED", txt, "->", num_box, meta, flush=True)
    else:
        rec["status"] = "skipped_other_number"
        other.append(f)
        print(f, "SKIP(other)", txt, flush=True)
    rec_all["pages"].append(rec)

json.dump(rec_all, open(os.path.join(BASE, "replace_log_%s.json" % OLD), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("CHANGED=%d OTHER=%d NONE=%d" % (len(changed), len(other), len(none)))
print("other pages:", ",".join(other))
print("DONE")
