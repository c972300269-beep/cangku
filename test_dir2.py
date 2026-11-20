# -*- coding: utf-8 -*-
"""方向判定：绿色区域 mask 降采样后的模板相关性（同批次证书布局一致，非常稳）"""
import pymupdf, numpy as np, cv2
from PIL import Image

PDF = r'C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-8086c25b6bc246d2-西区特种设备使用标志.pdf'
d = pymupdf.open(PDF)
N = 64


def load(i, dpi=110):
    pm = d[i].get_pixmap(dpi=dpi)
    return np.array(Image.frombytes('RGB', (pm.width, pm.height), pm.samples))


def rot_img(a, rot):
    if rot == 0:
        return a
    return cv2.rotate(a, {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180,
                          270: cv2.ROTATE_90_COUNTERCLOCKWISE}[rot])


def green_mask(a):
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    m = ((g > 80) & (g < 200) & (r < 130) & (b < 150) & (g - r > 25) & (g - b > 15)).astype(np.float32)
    return cv2.resize(m, (N, N), interpolation=cv2.INTER_AREA)


def corr(a, b):
    a = a.ravel() - a.mean()
    b = b.ravel() - b.mean()
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return 0.0 if na < 1e-6 or nb < 1e-6 else float(a.dot(b) / (na * nb))


# 参考模板：P2 原图已知正立（人工确认）
REF = green_mask(load(1))

print('参考模板 = P2 rot=0')
for idx in (0, 1, 4, 5, 6, 7, 12, 27):
    a0 = load(idx)
    scores = {}
    for rot in (0, 90, 180, 270):
        scores[rot] = round(corr(green_mask(rot_img(a0, rot)), REF), 3)
    best = max(scores, key=scores.get)
    orient = 'LAND' if a0.shape[1] > a0.shape[0] else 'PORT'
    print('P%-3d %s  ->  best=%3d   %s' % (idx + 1, orient, best, scores))
