# -*- coding: utf-8 -*-
"""Compare fonts for the narrow-number pages (P09 worst case) + P01 normal case."""
import os, sys, json
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replace_phone import read, ring_color

BASE = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone"
SRC = os.path.join(BASE, "pages")

font_files = {
    "simhei": r"C:\Windows\Fonts\simhei.ttf",
    "arialn": r"C:\Windows\Fonts\arialn.ttf",
    "msyhl": r"C:\Windows\Fonts\msyhl.ttc",
}
boxes = {}
for fp in ["replace_log_13535983438.json", "replace_log_18127418049.json"]:
    d = json.load(open(os.path.join(BASE, fp), encoding="utf-8"))
    for p in d["pages"]:
        if p.get("num_box"):
            boxes[p["page"]] = p["num_box"]

def render(text, fp, th, ss=4):
    from PIL import Image, ImageDraw, ImageFont
    big = max(20, th * ss)
    f = ImageFont.truetype(fp, big)
    tmp = Image.new("L", (big * (len(text) + 2), big * 3), 0)
    ImageDraw.Draw(tmp).text((big // 2, big // 2), text, font=f, fill=255, anchor="lt")
    a = np.array(tmp)
    ys, xs = np.where(a > 24)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    scale = th / a.shape[0]
    return cv2.resize(a, (max(1, int(round(a.shape[1] * scale))), th), interpolation=cv2.INTER_AREA)

def draw_on(img, box, text, fp, max_squeeze_ratio=1.0, pad=3):
    x0, y0, x1, y1 = box
    H, W = img.shape[:2]
    out = img.copy()
    cv2.rectangle(out, (x0 - pad, y0 - pad), (x1 + pad, y1 + pad),
                  tuple(int(v) for v in ring_color(img, box)), -1)
    th = y1 - y0
    tw = x1 - x0
    nat = render(text, fp, th)
    nw = nat.shape[1]
    if nw > tw:                                  # need horizontal squeeze
        k = max(tw / nw, max_squeeze_ratio)
        tw = int(round(nw * k))
    arr = cv2.resize(nat, (tw, th), interpolation=cv2.INTER_AREA)
    reg = out[y0:y1, x0:x0 + tw].astype(np.float32)
    al = (arr.astype(np.float32) / 255.0)[:, :, None]
    reg[:] = reg * (1 - al)
    out[y0:y1, x0:x0 + tw] = reg.astype(np.uint8)
    return out

for pg in ["P09.png", "P01.png"]:
    box = boxes[pg]
    img = read(os.path.join(SRC, pg))
    y0, y1 = max(0, box[1] - 22), min(img.shape[0], box[3] + 22)
    x0, x1 = max(0, box[0] - 260), min(img.shape[1], box[0] + 420)
    rows = [img[y0:y1, x0:x1]]
    labels = ["ORIG "]
    for name, fpth in font_files.items():
        for lim in ([1.0] if name == "arialn" else []) + ([0.85] if name == "arialn" else []):
            o = draw_on(img, box, "0763-3867022", fpth, max_squeeze_ratio=lim)
            rows.append(o[y0:y1, x0:x1])
            labels.append("%s%.2f" % (name.replace("simhei", "hei").replace("arialn", "nar").ljust(4), lim))
    h = max(r.shape[0] for r in rows); w = max(r.shape[1] for r in rows)
    rows = [np.vstack([r, np.full((h - r.shape[0], r.shape[1], 3), 255, np.uint8)]) for r in rows]
    rows = [np.hstack([r, np.full((r.shape[0], w - r.shape[1], 3), 255, np.uint8)]) for r in rows]
    sep = np.full((h, 2, 3), (0, 0, 255), np.uint8)
    inter = []
    for i, r in enumerate(rows):
        lab = np.full((h, 120, 3), 255, np.uint8)
        cv2.putText(lab, labels[i], (4, h // 2 + 8), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 0), 2)
        inter.append(lab); inter.append(r)
        if i < len(rows) - 1: inter.append(sep)
    strip = np.hstack(inter)
    strip = cv2.resize(strip, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC)
    o = os.path.join(BASE, "font_sample_%s.png" % pg.replace(".png", ""))
    cv2.imencode('.png', strip)[1].tofile(o)
    print(pg, "box", box, "orig w", box[2] - box[0], "->", o)
