import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# 图框块
print("=== 图框块实例 ===")
for e in msp:
    if e.dxftype() == "INSERT" and ("图框" in e.dxf.name):
        ins = e.dxf.insert
        print(f"   {e.dxf.name} @({ins[0]:.0f},{ins[1]:.0f}) rot={e.dxf.rotation} xscale={e.dxf.xscale} yscale={e.dxf.yscale}")

# 所有"图纸内容块"(含'平面图'/'地下室给排水')
print("\n=== 图纸内容块实例 ===")
for e in msp:
    if e.dxftype() == "INSERT" and ("平面图" in e.dxf.name or "给排水图" in e.dxf.name):
        ins = e.dxf.insert
        print(f"   {e.dxf.name} @({ins[0]:.0f},{ins[1]:.0f}) xscale={e.dxf.xscale}")

# 所有含"负一层"/"负二层"的TEXT，按坐标列出，找图名
def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    return s.replace('\\P', ' ').strip()
print("\n=== 含'负一层'/'负二层'且含'平面图'的图名文字 ===")
for e in msp:
    if e.dxftype() in ("TEXT", "MTEXT"):
        s = clean(e.dxf.text if e.dxftype() == "TEXT" else e.text)
        if ("负一" in s or "负二" in s or "地下一" in s or "地下二" in s) and ("平面图" in s or "放大" in s):
            pt = e.dxf.insert
            print(f"   [{s}] @({pt[0]:.0f},{pt[1]:.0f}) layer={e.dxf.layer}")
