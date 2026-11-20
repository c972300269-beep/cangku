# -*- coding: utf-8 -*-
"""QC strip for the incoming PDF: original line vs replaced line."""
import os, json
import numpy as np
import cv2
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replace_phone import read

BASE = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone"
SRC = os.path.join(BASE, "pages")
ED = os.path.join(BASE, "edited_v2")
import glob
log = {"pages": []}
for fp in sorted(glob.glob(os.path.join(BASE, "replace_log_v2.json"))):
    d = json.load(open(fp, encoding="utf-8"))
    log["pages"].extend(d.get("pages", []))
best = {}
for p in log["pages"]:
    cur = best.get(p["page"])
    if cur is None or (p.get("status") == "replaced" and cur.get("status") != "replaced"):
        best[p["page"]] = p
log["pages"] = [best[k] for k in sorted(best)]
pages = [p["page"] for p in log["pages"] if p.get("status") == "replaced"]
def _box(p):
    return p.get("box_final") or p.get("num_box") or p.get("box")
boxes = {p["page"]: _box(p) for p in log["pages"] if _box(p)}
print("replaced pages:", len(pages))

rows = []
for pg in pages:
    box = boxes[pg]
    y0, y1 = max(0, box[1] - 10), min(99999, box[3] + 12)
    x0, x1 = max(0, box[0] - 240), min(99999, box[2] + 30)
    a = read(os.path.join(SRC, pg))[y0:y1, x0:x1]
    b = read(os.path.join(ED, pg))[y0:y1, x0:x1]
    h = max(a.shape[0], b.shape[0]); w = max(a.shape[1], b.shape[1])
    def pad(im):
        im = np.hstack([im, np.full((im.shape[0], w - im.shape[1], 3), 255, np.uint8)])
        im = np.vstack([im, np.full((h - im.shape[0], im.shape[1], 3), 255, np.uint8)])
        return im
    a, b = pad(a), pad(b)
    sep = np.full((h, 3, 3), (0, 0, 255), np.uint8)
    lab = np.full((h, 120, 3), 255, np.uint8)
    cv2.putText(lab, pg.replace('.png', ''), (6, h // 2 + 8), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    sc = 2
    r = np.hstack([lab, a, sep, b])
    r = cv2.resize(r, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
    rows.append(r)
w = max(r.shape[1] for r in rows)
rows = [np.hstack([r, np.full((r.shape[0], w - r.shape[1], 3), 255, np.uint8)]) for r in rows]
CHUNK = 14
for ci, i in enumerate(range(0, len(rows), CHUNK)):
    strip = np.vstack(rows[i:i + CHUNK])
    suffix = "" if len(rows) <= CHUNK else "_part%d" % (ci + 1)
    out = os.path.join(BASE, "check_phone_strip%s.png" % suffix)
    cv2.imencode('.png', strip)[1].tofile(out)
    print("->", out, strip.shape)
