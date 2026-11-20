# -*- coding: utf-8 -*-
import json, base64, zlib, re
from pathlib import Path

p = Path("E:/workbuddy/Claw/reports/tdoc/opendoc_1.json")
j = json.loads(p.read_text(encoding="utf-8"))
el = j["clientVars"]["collab_client_vars"]["initialAttributedText"]["text"][0]


def dec_bytes(s):
    b = base64.b64decode(s)
    try:
        return zlib.decompress(b)
    except Exception:
        return zlib.decompress(b, -15)


raw = dec_bytes(el["related_sheet"])
txt = raw.decode("utf-8", "ignore")

TARGETS = ["香海彼岸（清远）", "龙湖苑（清远）", "雅悦花园（清远）"]
for t in TARGETS:
    idxs = [m.start() for m in re.finditer(re.escape(t), txt)]
    print("=" * 70)
    print(f"{t}  出现 {len(idxs)} 次")
    for i in idxs:
        seg = txt[max(0, i - 120): i + 500]
        seg = re.sub(r"[\x00-\x1f]", " ", seg)
        print("   ...", seg[:560].replace("  ", " "))
        print("   " + "-" * 60)
