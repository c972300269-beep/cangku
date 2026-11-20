import sys, math
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
XHS="$TwtSys$00000545"; BOX="A$C3ECF3B2E"; R434="$TwtSys$00000434"; R386="$TwtSys$00000386"

# all 545 world points (top + nested in BOX)
def xf(pt,I,rot,s):
    th=math.radians(rot); x,y=pt[0]*s,pt[1]*s
    return (I[0]+x*math.cos(th)-y*math.sin(th), I[1]+x*math.sin(th)+y*math.cos(th))
p545=[]
for e in msp:
    if e.dxftype()=="INSERT" and e.dxf.name==XHS:
        p545.append((e.dxf.insert[0],e.dxf.insert[1]))
for e in msp:
    if e.dxftype()=="INSERT" and e.dxf.name==BOX:
        I=(e.dxf.insert[0],e.dxf.insert[1]); rot=e.dxf.rotation; s=e.dxf.xscale or 1.0
        for sub in doc.blocks.get(BOX):
            if sub.dxftype()=="INSERT" and sub.dxf.name==XHS:
                p545.append(xf((sub.dxf.insert[0],sub.dxf.insert[1]),I,rot+sub.dxf.rotation,s*(sub.dxf.xscale or 1.0)))
print("545 总实例(世界点):", len(p545))

def near545(x,y,tol=120):
    for a,b in p545:
        if abs(a-x)<tol and abs(b-y)<tol: return True
    return False

for name in [R434, R386]:
    insts=[(e.dxf.insert[0],e.dxf.insert[1],e.dxf.layer) for e in msp
           if e.dxftype()=="INSERT" and e.dxf.name==name]
    lonely=[i for i in insts if not near545(i[0],i[1])]
    print(f"\n{name}: 顶层实例 {len(insts)}  图层分布 {dict(Counter(i[2] for i in insts))}")
    print(f"  其中 无邻近545 的(可能独立箱/其他): {len(lonely)}")
    # show a few lonely coords + layer
    for i in lonely[:10]:
        print("     ", round(i[0]), round(i[1]), i[2])
