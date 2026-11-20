# -*- coding: utf-8 -*-
"""Locate '应急救援电话：18127418049' line on every page, refine number bbox by column projection."""
import os, json, re
import numpy as np
import cv2
from rapidocr_onnxruntime import RapidOCR

SRC = r"E:\workbuddy\Claw\reports\tsb_badge\fixed"
OUT = r"E:\workbuddy\Claw\reports\tsb_badge\phone_boxes.json"

files = sorted([f for f in os.listdir(SRC) if re.match(r'^P\d+\.png$', f)])
ocr = RapidOCR()
data = {}

def col_profile_num(crop):
    """Return (x0,x1,y0,y1) of the dark glyph run that is furthest right in this line crop."""
    g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    cols = (bw > 0).sum(axis=0)
    h, w = bw.shape
    # find runs of columns with ink
    ink = cols > max(2, int(h * 0.02))
    runs = []
    s = None
    for i, v in enumerate(ink):
        if v and s is None: s = i
        elif not v and s is not None:
            if i - s > w * 0.01: runs.append((s, i))
            s = None
    if s is not None: runs.append((s, w))
    if not runs: return None
    # merge runs separated by small gaps (< 1.2% width) -> digits of one number
    merged = [list(runs[0])]
    for r in runs[1:]:
        if r[0] - merged[-1][1] < w * 0.012: merged[-1][1] = r[1]
        else: merged.append(list(r))
    # take the last merged run (right-most = the phone number, label is on the left)
    x0, x1 = merged[-1]
    rows = np.where((bw[:, x0:x1] > 0).sum(axis=1) > 0)[0]
    if len(rows) == 0: return None
    y0, y1 = rows.min(), rows.max()
    return (x0 / 2.0, x1 / 2.0, y0 / 2.0, y1 / 2.0)

for f in files:
    p = os.path.join(SRC, f)
    img = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    res, _ = ocr(img)
    line = None
    for box, txt, score in (res or []):
        t = txt.replace(' ', '')
        if '应急救援' in t or '救援电话' in t:
            line = (box, txt, float(score)); break
    if line is None:
        print(f, 'NO_LINE', flush=True); data[f] = None; continue
    box, txt, score = line
    xs = [b[0] for b in box]; ys = [b[1] for b in box]
    x0, y0, x1, y1 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
    pad = 6
    crop = img[max(0, y0 - pad):min(H, y1 + pad), max(0, x0 - pad):min(W, x1 + pad)]
    nb = col_profile_num(crop)
    rec = {'line_text': txt, 'score': round(score, 3),
           'line_box': [x0, y0, x1, y1], 'num_box_in_crop': nb}
    if nb:
        nx0, nx1, ny0, ny1 = nb
        rec['num_box'] = [int(x0 - pad + nx0), int(y0 - pad + ny0), int(x0 - pad + nx1), int(y0 - pad + ny1)]
        rec['num_wh'] = [int(nx1 - nx0), int(ny1 - ny0)]
    data[f] = rec
    print(f, txt, rec.get('num_box'), rec.get('num_wh'), flush=True)

with open(OUT, 'w', encoding='utf-8') as fp:
    json.dump(data, fp, ensure_ascii=False, indent=2)
print('DONE', len(data))
