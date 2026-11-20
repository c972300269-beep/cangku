# -*- coding: utf-8 -*-
import urllib.request, io, re, sys
from docx import Document

url = "http://wjj.zs.gov.cn/attachment/0/557/557937/2582174.docx"
try:
    data = urllib.request.urlopen(url, timeout=40).read()
    print("downloaded bytes:", len(data))
    doc = Document(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs]
    for t in doc.tables:
        for row in t.rows:
            parts.append(" | ".join(c.text for c in row.cells))
    text = "\n".join(parts)
    print("total chars:", len(text))
    if "海泉" in text:
        for m in re.finditer("海泉", text):
            s = max(0, m.start()-300); e = min(len(text), m.end()+300)
            print("\n=== MATCH ===\n" + text[s:e])
    else:
        print("NO '海泉' FOUND in this docx")
        # 打印前若干行帮助判断内容性质
        print("\n--- head 40 lines ---")
        print("\n".join(parts[:40]))
except Exception as e:
    print("ERR:", repr(e))
    sys.exit(2)
