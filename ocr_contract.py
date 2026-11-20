# -*- coding: utf-8 -*-
"""对合同扫描件页面做 OCR，输出每页文本，用于定位附件八配件报价表。"""
import os, sys, glob
from rapidocr_onnxruntime import RapidOCR

SRC = r'E:\workbuddy\Claw\reports\contract_xianghai1'
OUT = r'E:\workbuddy\Claw\reports\contract_xianghai1\ocr'
os.makedirs(OUT, exist_ok=True)

engine = RapidOCR()

files = sorted(glob.glob(os.path.join(SRC, 'p*.png')))
print('pages:', len(files), flush=True)

for f in files:
    name = os.path.basename(f).replace('.png', '')
    result, _ = engine(f)
    lines = []
    if result:
        for item in result:
            txt = item[1]
            if txt and txt.strip():
                lines.append(txt.strip())
    with open(os.path.join(OUT, name + '.txt'), 'w', encoding='utf-8') as fp:
        fp.write('\n'.join(lines))
    print(name, 'lines=', len(lines), flush=True)

print('DONE', flush=True)
