import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter, defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

types = Counter()
circ_by_layer = Counter()
lwpoly_verts = Counter()
tri_by_layer = Counter()
tri_pts = []
lines_by_layer = Counter()

for e in msp:
    t = e.dxftype()
    types[t] += 1
    if t == "CIRCLE":
        circ_by_layer[e.dxf.layer] += 1
    elif t == "LINE":
        lines_by_layer[e.dxf.layer] += 1
    elif t == "LWPOLYLINE":
        pts = list(e.get_points('xy'))
        lwpoly_verts[len(pts)] += 1
        if len(pts) == 3:
            tri_by_layer[e.dxf.layer] += 1
            c = e.dxf.center if e.dxf.hasattr('center') else None
            tri_pts.append((e.dxf.layer, pts))

print("=== 全图 modelspace 实体类型统计 ===")
for k, v in types.most_common():
    print(f"   {k}: {v}")

print("\n=== CIRCLE 图层分布 (TOP30) ===")
for k, v in circ_by_layer.most_common(30):
    print(f"   {k}: {v}")

print("\n=== LWPOLYLINE 顶点数分布 ===")
for k, v in sorted(lwpoly_verts.items()):
    print(f"   {k}个顶点: {v}")

print("\n=== 3顶点闭合多段线(候选三角形) 图层分布 ===")
for k, v in tri_by_layer.most_common():
    print(f"   {k}: {v}")

print(f"\n三角形(3顶点LWPOLYLINE)样例(前15):")
for lay, pts in tri_pts[:15]:
    print(f"   layer={lay} pts={[(round(x,1),round(y,1)) for x,y in pts]}")

print("\n=== LINE 图层分布 (TOP20) ===")
for k, v in lines_by_layer.most_common(20):
    print(f"   {k}: {v}")
