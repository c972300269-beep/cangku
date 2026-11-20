# -*- coding: utf-8 -*-
"""Build a zoomed QC strip: original line vs replaced line for every changed page."""
import os, json
import numpy as np
import cv2

BASE = r"E:\workbuddy\Claw\reports\tsb_badge"
SRC = os.path.join(BASE, "fixed")
ED = os.path.join(BASE, "edited")
boxes = json.load(open(os.path.join(BASE, "phone_boxes.json"), encoding="utf-8"))

def read(p):
    return cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)

pages = sorted([f for f in os.listdir(ED) if f.endswith(".png")])
rows = []
for pg in pages:
    rec = boxes[pg]
    box = rec["num_box"]
    y0 = max(0, box[1] - 12); y1 = min(99999, box[3] + 14)
    x0 = max(0, box[0] - 300); x1 = min(99999, box[2] + 40)
    a = read(os.path.join(SRC, pg))[y0:y1, x0:x1]
    b = read(os.path.join(ED, pg))[y0:y1, x0:x1]
    h = max(a.shape[0], b.shape[0])
    def pad(im):
        if im.shape[0] < h:
            im = np.vstack([im, np.full((h - im.shape[0], im.shape[1], 3), 255, np.uint8)])
        return im
    a, b = pad(a), pad(b)
    sep = np.full((h, 3, 3), (0, 0, 255), np.uint8)
    lab = np.full((h, 130, 3), 255, np.uint8)
    cv2.putText(lab, pg.replace('.png', ''), (6, h // 2 + 10), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    rows.append(np.hstack([lab, a, sep, b]))

w = max(r.shape[1] for r in rows)
rows = [np.hstack([r, np.full((r.shape[0], w - r.shape[1], 3), 255, np.uint8)]) for r in rows]
strip = np.vstack(rows)
out = os.path.join(BASE, "check_phone_strip.png")
cv2.imencode('.png', strip)[1].tofile(out)
print("pages in strip:", len(pages), "->", out, strip.shape)
