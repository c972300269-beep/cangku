# -*- coding: utf-8 -*-
"""验证：关闭方向分类(cls)后，倒置文本的 OCR 命中率是否显著下降"""
import pymupdf, numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

PDF = r'C:\Users\CHENJI~1\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-8086c25b6bc246d2-西区特种设备使用标志.pdf'
KW = ['特种设备', '使用标志', '电梯', '使用单位', '设备代码', '检验', '维保', '登记']

d = pymupdf.open(PDF)
pm = d[1].get_pixmap(dpi=100)          # P2（已知：原图正立）
base = Image.frombytes('RGB', (pm.width, pm.height), pm.samples)

for name, kwargs in [('default', {}), ('cls_off', {'use_cls': False})]:
    try:
        eng = RapidOCR(**kwargs)
        ok = 'OK'
    except Exception as e:
        print('%s init FAILED: %s' % (name, e))
        continue
    for rot in (0, 180):
        im = base if rot == 0 else base.rotate(-rot, expand=True)
        res, _ = eng(np.array(im))
        if not res:
            print('%-8s rot=%3d  NO RESULT' % (name, rot))
            continue
        nkw = sum(1 for it in res if any(k in it[1] for k in KW))
        try:
            conf = sum(float(it[2]) for it in res) / len(res)
        except Exception:
            conf = -1
        print('%-8s rot=%3d  boxes=%3d  kw=%3d  conf=%.3f' % (name, rot, len(res), nkw, conf))
