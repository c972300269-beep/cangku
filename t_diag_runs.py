# -*- coding: utf-8 -*-
"""Diagnose column runs inside the 应急救援电话 row only (window derived from known num_box)."""
import os, sys, json
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from replace_phone import read

BASE = r"E:\workbuddy\Claw\reports\tsb_badge\pdf_phone"
SRC = os.path.join(BASE, "pages")

boxes = {}
for fp in ["replace_log_13535983438.json", "replace_log_18127418049.json"]:
    d = json.load(open(os.path.join(BASE, fp), encoding="utf-8"))
    for p in d["pages"]:
        if p.get("num_box"):
            boxes[p["page"]] = (p["num_box"], p.get("text", ""))

for pg in ["P09.png", "P01.png", "P17.png"]:
    box, txt = boxes[pg]
    x0, y0, x1, y1 = box
    hi, wi = None, None
    img = read(os.path.join(SRC, pg))
    ax0, ax1 = max(0, x0 - 420), min(img.shape[1], x1 + 5)
    ay0, ay1 = max(0, y0 - 8), min(img.shape[0], y1 + 8)
    band = img[ay0:ay1, ax0:ax1]
    g = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = bw.shape
    cols = (bw > 0).sum(axis=0)
    ink = cols > max(1, int(h * 0.015))
    runs, s = [], None
    for i, v in enumerate(ink):
        if v and s is None: s = i
        elif not v and s is not None: runs.append((s, i)); s = None
    if s is not None: runs.append((s, w))
    runs = [(a, b) for a, b in runs if b - a > 3]
    print("=" * 74)
    print("%s  text=%s  num_box=%s  row window x[%d,%d]" % (pg, txt, box, ax0, ax1))
    prev = None
    for a, b in runs:
        gap = "" if prev is None else "gap=%4.1f" % ((a - prev) / 2.0)
        mark = ""
        xa, xb = ax0 + a / 2.0, ax0 + b / 2.0
        if abs(xa - x0) < 6: mark = "  <== num_box starts here"
        print("   x=%7.1f..%7.1f  w=%5.1f  %s%s" % (xa, xb, (b - a) / 2.0, gap, mark))
        prev = b
