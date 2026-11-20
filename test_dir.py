# -*- coding: utf-8 -*-
"""用图像特征判断扫描件朝向：二维码位置 + 绿色条带分布"""
import pymupdf, numpy as np
from PIL import Image
import cv2

PDF = r'C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-8086c25b6bc246d2-西区特种设备使用标志.pdf'
d = pymupdf.open(PDF)


def load(i, dpi=110):
    pm = d[i].get_pixmap(dpi=dpi)
    return np.array(Image.frombytes('RGB', (pm.width, pm.height), pm.samples))


def rot_img(a, rot):
    if rot == 0:
        return a
    k = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}[rot]
    return cv2.rotate(a, k)


def qr_info(a):
    """返回二维码检测结果：数量 + 最大码的中心相对坐标"""
    gray = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    det = cv2.QRCodeDetector()
    ok, pts = det.detect(gray)
    if not ok or pts is None:
        return 0, None
    pts = np.array(pts).reshape(-1, 2)
    if len(pts) < 4:
        return 0, None
    cx = pts[:, 0].mean() / a.shape[1]
    cy = pts[:, 1].mean() / a.shape[0]
    return 1, (round(cx, 3), round(cy, 3))


def green_profile(a):
    """按行统计深绿色像素占比，返回 10 桶 profile"""
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    mask = (g > 80) & (g < 190) & (r < 120) & (b < 140) & (g - r > 30) & (g - b > 20)
    rows = mask.mean(axis=1)
    h = len(rows)
    return [round(float(rows[int(h * i / 10):int(h * (i + 1) / 10)].mean()), 3) for i in range(10)]


for idx in (1, 6, 7):
    a0 = load(idx)
    print('===== P%d  (orig %dx%d) =====' % (idx + 1, a0.shape[1], a0.shape[0]))
    for rot in (0, 90, 180, 270):
        a = rot_img(a0, rot)
        n, c = qr_info(a)
        print('  rot=%3d  qr_cnt=%d center=%s  green=%s' % (rot, n, c, green_profile(a)))
