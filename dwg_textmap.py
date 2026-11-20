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

print("=== 含'消火栓'的文字（全部） ===")
seen = set()
for (s, x, y, ly) in texts:
    if "消火栓" in s and s not in seen:
        seen.add(s)
        print(f"   [{s}] @({x:.0f},{y:.0f}) {ly}")

print("\n=== 含'平面图'的文字（全部） ===")
seen = set()
for (s, x, y, ly) in texts:
    if "平面图" in s and s not in seen:
        seen.add(s)
        print(f"   [{s}] @({x:.0f},{y:.0f}) {ly}")

print("\n=== 含 负一/负二/地下一/地下二/地下车库 的文字（全部） ===")
seen = set()
for (s, x, y, ly) in texts:
    if any(k in s for k in ["负一层", "负二层", "地下一层", "地下二层", "地下车库", "人防"]) and s not in seen:
        seen.add(s)
        print(f"   [{s}] @({x:.0f},{y:.0f}) {ly}")

print("\n=== 图框相关图层 TK_TEXT(图框文字) 的全部文字 ===")
seen = set()
for (s, x, y, ly) in texts:
    if "TK_TEXT" in ly and s not in seen:
        seen.add(s)
        print(f"   [{s}] @({x:.0f},{y:.0f}) {ly}")
