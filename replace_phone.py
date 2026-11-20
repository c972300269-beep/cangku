# -*- coding: utf-8 -*-
"""Replace 应急救援电话 number on scanned badges, keeping position & layout.

usage:
  python replace_phone.py sample P01          -> make a zoomed before/after strip for eyeballing
  python replace_phone.py run                 -> process all pages into edited/
"""
import os, sys, json, re
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

BASE = r"E:\workbuddy\Claw\reports\tsb_badge"
SRC = os.path.join(BASE, "fixed")
BOX = os.path.join(BASE, "phone_boxes.json")
DST = os.path.join(BASE, "edited")
os.makedirs(DST, exist_ok=True)

OLD = "18127418049"
NEW = "0763-3867022"
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\arial.ttf",
]

def read(p):
    return cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)

def ring_color(img, box, pad=8):
    x0, y0, x1, y1 = box
    H, W = img.shape[:2]
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(W, x1 + pad), min(H, y1 + pad)
    reg = img[y0:y1, x0:x1]
    if reg.size == 0:
        return np.array([255.0, 255.0, 255.0])
    return np.median(reg.reshape(-1, 3), axis=0)

def pick_font(target_h):
    """choose font + size so that digit height ~= target_h"""
    best = None
    for fp in FONT_CANDIDATES:
        if not os.path.exists(fp): continue
        lo, hi = 10, 200
        for _ in range(30):
            mid = (lo + hi) // 2
            f = ImageFont.truetype(fp, mid)
            bb = ImageDraw.Draw(Image.new("RGB", (10, 10))).textbbox((0, 0), "0", font=f)
            h = bb[3] - bb[1]
            if h < target_h: lo = mid
            else: hi = mid
        f = ImageFont.truetype(fp, hi)
        bb = ImageDraw.Draw(Image.new("RGB", (10, 10))).textbbox((0, 0), "0", font=f)
        h = bb[3] - bb[1]
        if best is None or abs(h - target_h) < abs(best[2] - target_h):
            best = (fp, hi, h)
    return best

def render_fit(text, fp, tw, th, ss=4):
    """Render text at ss*x, crop to ink, then fit exactly into (tw, th) -> uint8 ink array."""
    big = max(20, th * ss)
    f = ImageFont.truetype(fp, big)
    tmp = Image.new("L", (big * (len(text) + 2), big * 3), 0)
    ImageDraw.Draw(tmp).text((big // 2, big // 2), text, font=f, fill=255, anchor="lt")
    a = np.array(tmp)
    ys, xs = np.where(a > 24)
    if len(xs) == 0:
        return None
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return cv2.resize(a, (max(1, tw), max(1, th)), interpolation=cv2.INTER_AREA)

def replace_one(img, box, new_text, pad_clear=3, font=None):
    x0, y0, x1, y1 = box
    H, W = img.shape[:2]
    cx0, cy0 = max(0, x0 - pad_clear), max(0, y0 - pad_clear)
    cx1, cy1 = min(W, x1 + pad_clear), min(H, y1 + pad_clear)
    bg = ring_color(img, box)
    cv2.rectangle(img, (cx0, cy0), (cx1, cy1), (int(bg[0]), int(bg[1]), int(bg[2])), -1)

    tw, th = x1 - x0, y1 - y0                    # match original ink box exactly
    arr = None
    fp_used = None
    for fp in ([font] if font else ["C:\\Windows\\Fonts\\simhei.ttf", "C:\\Windows\\Fonts\\arial.ttf",
                                    "C:\\Windows\\Fonts\\simsun.ttc", "C:\\Windows\\Fonts\\msyh.ttc"]):
        if not os.path.exists(fp):
            continue
        arr = render_fit(new_text, fp, tw, th)
        if arr is not None:
            fp_used = fp
            break
    if arr is None:
        return img, None
    fp, k = fp_used, 1.0
    gray = img[cy0:cy1, cx0:cx1].astype(np.float32)
    gh, gw = gray.shape[:2]
    oy, ox = (gh - arr.shape[0]) // 2, pad_clear
    if oy < 0: oy = 0
    sub = gray[oy:oy + arr.shape[0], ox:ox + arr.shape[1]]
    alpha = (arr.astype(np.float32) / 255.0)[:, :, None]
    sub[:] = sub * (1 - alpha) + np.array([0, 0, 0], np.float32) * alpha
    gray_out = gray.astype(np.uint8)
    img[cy0:cy1, cx0:cx1] = gray_out
    return img, (fp, k, th, arr.shape[1], arr.shape[0])

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "sample"
    boxes = json.load(open(BOX, encoding="utf-8"))
    if mode == "sample":
        pages = sys.argv[2].split(",") if len(sys.argv) > 2 else ["P01.png"]
    else:
        pages = sorted(boxes.keys())
    changed, skipped = [], []
    for pg in pages:
        rec = boxes.get(pg)
        if not rec or not rec.get("num_box"):
            skipped.append((pg, "no box")); continue
        txt = rec["line_text"].replace(" ", "")
        if OLD not in txt:
            skipped.append((pg, "number is " + txt)); continue
        img = read(os.path.join(SRC, pg))
        box = rec["num_box"]
        out, meta = replace_one(img, box, NEW)
        if mode == "sample":
            crop_src = read(os.path.join(SRC, pg))
            y0, y1 = max(0, box[1] - 40), min(crop_src.shape[0], box[3] + 40)
            x0, x1 = max(0, box[0] - 420), min(crop_src.shape[1], box[0] + 760)
            a = crop_src[y0:y1, x0:x1]
            b = out[y0:y1, x0:x1]
            sc = 2
            a = cv2.resize(a, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
            b = cv2.resize(b, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
            strip = np.vstack([a, b])
            sp = os.path.join(BASE, "sample_%s.png" % os.path.splitext(pg)[0])
            cv2.imencode('.png', strip)[1].tofile(sp)
            print(pg, "SAMPLE ->", sp, "font=%s k=%.3f h=%d out=%dx%d" % (os.path.basename(meta[0]), meta[1], meta[2], meta[3], meta[4]), flush=True)
        else:
            sp = os.path.join(DST, pg)
            cv2.imencode('.png', out)[1].tofile(sp)
            changed.append(pg)
            print(pg, "OK font=%s k=%.3f h=%d out=%dx%d" % (os.path.basename(meta[0]), meta[1], meta[2], meta[3], meta[4]), flush=True)
    if mode != "sample":
        print("CHANGED=%d SKIPPED=%d" % (len(changed), len(skipped)))
        for s in skipped: print("  SKIP", s[0], s[1])

if __name__ == "__main__":
    main()
