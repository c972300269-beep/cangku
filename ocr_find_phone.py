# -*- coding: utf-8 -*-
import os, sys, json
import numpy as np
import cv2
from rapidocr_onnxruntime import RapidOCR

SRC = r"E:\workbuddy\Claw\reports\tsb_badge\fixed"
pages = sys.argv[1].split(',') if len(sys.argv) > 1 else ['P01']
ocr = RapidOCR()
res_all = {}
for p in pages:
    f = os.path.join(SRC, p + '.png')
    img = cv2.imdecode(np.fromfile(f, dtype=np.uint8), cv2.IMREAD_COLOR)
    res, _ = ocr(img)
    hits = []
    if res:
        for box, txt, score in res:
            if '18127418049' in txt.replace(' ', '') or '1812741' in txt.replace(' ', '') or '3867022' in txt.replace(' ', ''):
                xs = [b[0] for b in box]; ys = [b[1] for b in box]
                hits.append({'text': txt, 'score': round(float(score), 3),
                             'box': [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]})
    res_all[p] = hits
    print(p, 'hits=', len(hits), flush=True)
    for h in hits:
        print('   ', h['text'], h['box'], h['score'], flush=True)
    # dump all texts for inspection (first page only)
    if p == pages[0] and res:
        txts = [t for _, t, _ in res]
        with open(os.path.join(SRC, '_ocr_' + p + '.txt'), 'w', encoding='utf-8') as fp:
            fp.write('\n'.join(txts))
        print('   (all texts dumped to _ocr_%s.txt, %d lines)' % (p, len(txts)), flush=True)
with open(r"E:\workbuddy\Claw\reports\tsb_badge\phone_hits.json", 'w', encoding='utf-8') as fp:
    json.dump(res_all, fp, ensure_ascii=False, indent=2)
print('DONE')
