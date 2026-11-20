import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# 统计每个块被引用次数（modelspace 顶层 + 嵌套）
use = Counter()
for e in msp:
    if e.dxftype() == "INSERT":
        def walk(name):
            b = doc.blocks.get(name)
            if not b: return
            for ent in b:
                if ent.dxftype() == "INSERT":
                    use[ent.dxf.name] += 1
                    walk(ent.dxf.name)
        use[e.dxf.name] += 1
        walk(e.dxf.name)

print("=== 含 CIRCLE 的块定义（候选：栓口/泵/水箱符号） ===")
for blk in doc.blocks:
    ents = list(blk)
    circs = [e for e in ents if e.dxftype() == "CIRCLE"]
    if not circs:
        continue
    tcount = Counter(e.dxftype() for e in ents)
    print(f"\n  块 {blk.name}  被引用≈{use.get(blk.name,0)} 次")
    print(f"     实体构成: {dict(tcount)}")
    for c in circs[:3]:
        print(f"     CIRCLE center={tuple(round(v,1) for v in c.dxf.center)} r={round(c.dxf.radius,1)}")

print("\n=== 含 3顶点LWPOLYLINE(三角形) 的块定义 ===")
for blk in doc.blocks:
    ents = list(blk)
    tris = [e for e in ents if e.dxftype() == "LWPOLYLINE" and len(list(e.get_points('xy'))) == 3]
    if tris:
        tcount = Counter(e.dxftype() for e in ents)
        print(f"  块 {blk.name}  引用≈{use.get(blk.name,0)}  构成={dict(tcount)}")
