import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# 找轴网图层（含 地下一层/地下二层/负一层/负二层 + 轴网）
axis_layers = []
for l in doc.layers:
    n = l.dxf.name
    if ('轴网' in n) and ('地下一层' in n or '地下二层' in n or '负一层' in n or '负二层' in n):
        axis_layers.append(n)
print("轴网相关图层:", len(axis_layers))
for n in axis_layers:
    print("  ", n)

# 计算每层轴网包围盒
box = {}
for ly in axis_layers:
    xs, ys = [], []
    for e in msp:
        if e.dxf.layer != ly:
            continue
        try:
            pts = []
            t = e.dxftype()
            if t == "LINE":
                pts = [e.dxf.start, e.dxf.end]
            elif t in ("LWPOLYLINE","POLYLINE"):
                pts = list(e.get_points())
            elif t in ("INSERT",):
                try: ins = e.dxf.insert
                except Exception:
                    try: ins = e.insert
                    except Exception: ins = None
                if ins: pts = [ins]
            for pt in pts:
                xs.append(pt[0]); ys.append(pt[1])
        except Exception:
            pass
    if xs:
        box[ly] = (min(xs), min(ys), max(xs), max(ys), len(xs))
print("\n=== 轴网图层包围盒 (minx,miny,maxx,maxy,点数) ===")
for ly in axis_layers:
    if ly in box:
        a,b,c,d,n = box[ly]
        print(f"  {ly}\n      X[{a:.0f}~{c:.0f}] Y[{b:.0f}~{d:.0f}] 点{n}")

# 同时查 负一层框架柱/负二层框架柱 包围盒（更可靠界定楼层平面）
print("\n=== 框架柱图层（负一/负二层）包围盒 ===")
col_layers = [l.dxf.name for l in doc.layers if '框架柱' in l.dxf.name and ('负一层' in l.dxf.name or '负二层' in l.dxf.name)]
for ly in col_layers:
    xs, ys = [], []
    for e in msp:
        if e.dxf.layer != ly: continue
        t = e.dxftype()
        try:
            if t in ("LWPOLYLINE","POLYLINE","LINE"):
                if t=="LINE": pts=[e.dxf.start,e.dxf.end]
                else: pts=list(e.get_points())
                for pt in pts: xs.append(pt[0]); ys.append(pt[1])
        except Exception: pass
    if xs:
        print(f"  {ly}: X[{min(xs):.0f}~{max(xs):.0f}] Y[{min(ys):.0f}~{max(ys):.0f}]")
