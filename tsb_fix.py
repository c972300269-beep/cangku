# -*- coding: utf-8 -*-
"""
西区特种设备使用标志 - 扫描件方向自动统一

原理：同批次证书版式一致（顶部绿色标题条 + 底部绿色说明条）。
把每页的「绿色区域 mask」降采样为 64x64，与已知正立页的参考模板做相关系数，
对 0/90/180/270 四个候选朝向取相关最高者为正确朝向。

输出：统一方向的单页 PNG（目录 fixed/）+ 合并 PDF（A4 横向）。
"""
import os
import io
import json
import pymupdf
import numpy as np
import cv2
from PIL import Image

PDF = r'C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-8086c25b6bc246d2-西区特种设备使用标志.pdf'
BASE = r'E:\workbuddy\Claw\reports\tsb_badge'
OUTDIR = os.path.join(BASE, 'fixed')
os.makedirs(OUTDIR, exist_ok=True)

N = 64
REF_PAGES = [0, 1]        # P1、P2 —— 已人工确认正立（横向），作为参考模板
SKIP_OUT = os.environ.get('TSB_SKIP_OUT') == '1'


def render_np(pg, dpi):
    pm = pg.get_pixmap(dpi=dpi)
    return np.array(Image.frombytes('RGB', (pm.width, pm.height), pm.samples))


def rot_img(a, rot):
    if rot == 0:
        return a
    kernel = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180,
              270: cv2.ROTATE_90_COUNTERCLOCKWISE}[rot]
    return cv2.rotate(a, kernel)


def green_mask(a):
    """深绿色掩码 -> 64x64 浮点图"""
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    m = ((g > 80) & (g < 200) & (r < 130) & (b < 150) & (g - r > 25) & (g - b > 15)).astype(np.float32)
    return cv2.resize(m, (N, N), interpolation=cv2.INTER_AREA)


def corr(a, b):
    a = a.ravel() - a.mean()
    b = b.ravel() - b.mean()
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return 0.0 if na < 1e-6 or nb < 1e-6 else float(a.dot(b) / (na * nb))


def main():
    doc = pymupdf.open(PDF)
    print('pages: %d' % len(doc), flush=True)

    refs = [green_mask(render_np(doc[i], 110)) for i in REF_PAGES]
    print('参考模板: %s' % ['P%d' % (i + 1) for i in REF_PAGES], flush=True)

    plan = []
    for i, pg in enumerate(doc):
        a0 = render_np(pg, 110)
        scores = {}
        for rot in (0, 90, 180, 270):
            mm = green_mask(rot_img(a0, rot))
            scores[rot] = round(sum(corr(mm, r) for r in refs) / len(refs), 4)
        best = max(scores, key=scores.get)
        margin = scores[best] - sorted(scores.values())[-2]
        plan.append({'page': i + 1, 'rot': best, 'scores': scores, 'margin': round(margin, 4)})
        print('P%-3d best=%3d  margin=%.3f  %s' % (i + 1, best, margin, scores), flush=True)

    with open(os.path.join(BASE, 'orientation_plan.json'), 'w', encoding='utf-8') as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)

    low_conf = [p['page'] for p in plan if p['margin'] < 0.15]
    print('低置信页(需人工复核): %s' % low_conf, flush=True)

    if SKIP_OUT:
        print('DONE (detect only)', flush=True)
        return

    # ---------- 输出 ----------
    pages_img = []
    for i, pg in enumerate(doc):
        rot = plan[i]['rot']
        im = render_np(pg, 200)
        if rot:
            im = rot_img(im, rot)
        Image.fromarray(im).save(os.path.join(OUTDIR, 'P%02d.png' % (i + 1)))
        pages_img.append(im)
    print('PNG 输出完成: %s' % OUTDIR, flush=True)

    A4W, A4H = 842, 595
    out = pymupdf.open()
    for im in pages_img:
        h, w = im.shape[:2]
        page = out.new_page(width=A4W, height=A4H)
        s = min(A4W / w, A4H / h)
        dw, dh = w * s, h * s
        rect = pymupdf.Rect((A4W - dw) / 2, (A4H - dh) / 2, (A4W + dw) / 2, (A4H + dh) / 2)
        b = io.BytesIO()
        Image.fromarray(im).save(b, format='JPEG', quality=88)
        page.insert_image(rect, stream=b.getvalue())
    pdf_out = os.path.join(OUTDIR, '西区特种设备使用标志_方向已统一.pdf')
    out.save(pdf_out, deflate=True)
    out.close()
    print('PDF -> ' + pdf_out, flush=True)
    print('DONE', flush=True)


if __name__ == '__main__':
    main()
