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
        texts.append((clean(e.dxf.text or ""), e.dxf.insert[0], e.dxf.insert[1]))
    elif e.dxftype() == "MTEXT":
        texts.append((clean(e.text or ""), e.dxf.insert[0], e.dxf.insert[1]))

xhs = []
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == "$TwtSys$00000545":
        xhs.append((e.dxf.insert[0], e.dxf.insert[1]))

def report(x0, x1, y0, y1, name):
    n = sum(1 for q in xhs if x0 <= q[0] <= x1 and y0 <= q[1] <= y1)
    ts = [s for (s, x, y) in texts if x0 <= x <= x1 and y0 <= y <= y1]
    c1 = sum(1 for s in ts if "负一层" in s or "地下一层" in s)
    c2 = sum(1 for s in ts if "负二层" in s or "地下二层" in s)
    elev = [s for s in ts if re.search(r'-\d\.\d{2,3}|\+\d\.\d{2,3}', s)]
    print(f"\n### {name}: 消火栓 {n}")
    print(f"   '负一层/地下一层' 出现 {c1} 次；'负二层/地下二层' 出现 {c2} 次")
    print(f"   含标高的文字 {len(elev)} 条，样例：")
    for s in list(dict.fromkeys(elev))[:15]:
        print("      ", s)

report(60000, 520000, -240000, 160000, "左簇")
report(930000, 1200000, 330000, 620000, "右上簇")
# 全图
print("\n### 全图")
c1 = sum(1 for s, x, y in texts if "负一层" in s or "地下一层" in s)
c2 = sum(1 for s, x, y in texts if "负二层" in s or "地下二层" in s)
print(f"   '负一层'计 {c1}，'负二层'计 {c2}")
