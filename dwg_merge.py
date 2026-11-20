import sys, math
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
XHS = "$TwtSys$00000545"; BOX = "A$C3ECF3B2E"

pts = []  # (x, y, src)
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == XHS:
        pts.append((e.dxf.insert[0], e.dxf.insert[1], "single"))

def xf(pt, I, rot_deg, s):
    th = math.radians(rot_deg)
    x, y = pt[0]*s, pt[1]*s
    return (I[0] + x*math.cos(th) - y*math.sin(th), I[1] + x*math.sin(th) + y*math.cos(th))

box_pts = []
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == BOX:
        I = (e.dxf.insert[0], e.dxf.insert[1]); rot = e.dxf.rotation; s = e.dxf.xscale or 1.0
        blk = doc.blocks.get(BOX)
        for sub in blk:
            if sub.dxftype() == "INSERT" and sub.dxf.name == XHS:
                loc = (sub.dxf.insert[0], sub.dxf.insert[1])
                w = xf(loc, I, rot + sub.dxf.rotation, s * (sub.dxf.xscale or 1.0))
                box_pts.append((w[0], w[1], "box"))

print("顶层单栓 545:", len(pts))
print("双栓箱 A$C3ECF3B2E 实例:", sum(1 for e in msp if e.dxftype()=="INSERT" and e.dxf.name==BOX),
      " 内含栓口:", len(box_pts))

allp = pts + box_pts
merged = []
for (x, y, s) in allp:
    hit = None
    for m in merged:
        if abs(m[0]-x) < 60 and abs(m[1]-y) < 60:
            hit = m; break
    if hit:
        hit[3].add(s)
    else:
        merged.append([x, y, s, {s}])
print("合并去重后栓口总数:", len(merged))
from collections import Counter
cc = Counter(tuple(sorted(m[3])) for m in merged)
for k, v in cc.items():
    print("   来源", k, ":", v)

# 分簇
def rep(x0, x1, y0, y1, name):
    c = sum(1 for m in merged if x0 <= m[0] <= x1 and y0 <= m[1] <= y1)
    cs = sum(1 for m in merged if x0 <= m[0] <= x1 and y0 <= m[1] <= y1 and m[3] == {"single"})
    cb = sum(1 for m in merged if x0 <= m[0] <= x1 and y0 <= m[1] <= y1 and "box" in m[3])
    print(f"{name}: 栓口 {c}  (纯单栓 {cs}, 含双栓箱 {cb})")

rep(-5000, 620000, -400000, 300000, "左簇")
rep(650000, 1250000, 250000, 700000, "右上簇")
