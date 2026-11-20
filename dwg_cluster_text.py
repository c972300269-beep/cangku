import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    return s.replace('\\P', ' ').strip()

texts = []
for e in msp:
    if e.dxftype() == "TEXT":
        texts.append((clean(e.dxf.text or ""), e.dxf.insert[0], e.dxf.insert[1], e.dxf.layer))
    elif e.dxftype() == "MTEXT":
        texts.append((clean(e.text or ""), e.dxf.insert[0], e.dxf.insert[1], e.dxf.layer))

xhs = []
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == "$TwtSys$00000545":
        xhs.append((e.dxf.insert[0], e.dxf.insert[1]))

def cluster(x0, x1, y0, y1, name):
    pts = [q for q in xhs if x0 <= q[0] <= x1 and y0 <= q[1] <= y1]
    print("=" * 70)
    print(f"簇 {name}: X[{x0}~{x1}] Y[{y0}~{y1}]  消火栓数 = {len(pts)}")
    ts = [(s, x, y, ly) for (s, x, y, ly) in texts if x0-50000 <= x <= x1+50000 and y0-50000 <= y <= y1+50000]
    print(f"  附近文字 {len(ts)} 条，含关键词的：")
    kws = ["负一", "负二", "地下一", "地下二", "标高", "-5.", "-6.", "-9.", "-10.", "平面", "消火栓", "A1-", "A2-", "车库", "人防", "防火分区"]
    seen = set()
    for (s, x, y, ly) in ts:
        if any(k in s for k in kws) and s not in seen:
            seen.add(s)
            print(f"     [{s}] @({x:.0f},{y:.0f}) {ly}")

cluster(60000, 520000, -240000, 160000, "左簇")
cluster(950000, 1180000, 350000, 600000, "右上簇")
cluster(400000, 1700000, -180000, 300000, "中右零星")
