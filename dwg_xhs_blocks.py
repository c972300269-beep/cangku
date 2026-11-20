import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter, defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# EQUIP_消火栓 图层上的 INSERT 块名分布
print("=== EQUIP_消火栓 图层上 INSERT 的块名分布 ===")
names = Counter()
pos = defaultdict(list)
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.layer == "EQUIP_消火栓":
        names[e.dxf.name] += 1
        pos[e.dxf.name].append((e.dxf.insert[0], e.dxf.insert[1]))
for k, v in names.most_common():
    xs = [p_[0] for p_ in pos[k]]; ys = [p_[1] for p_ in pos[k]]
    print(f"   {k}: {v}  X[{min(xs):.0f}~{max(xs):.0f}] Y[{min(ys):.0f}~{max(ys):.0f}]")

# 对每个块名，检查块定义内的实体构成（找三角形+圆+叉特征）
print("\n=== 各块定义的实体构成 ===")
for name in names:
    blk = doc.blocks.get(name)
    if blk is None:
        print(f"   {name}: <无块定义>")
        continue
    c = Counter()
    for ent in blk:
        c[ent.dxftype()] += 1
    print(f"   {name}: {dict(c)}")
    # 打印块内实体细节（前若干）
    for ent in blk:
        t = ent.dxftype()
        if t == "CIRCLE":
            print(f"        CIRCLE center={ent.dxf.center} r={ent.dxf.radius}")
        elif t == "LINE":
            s, ee = ent.dxf.start, ent.dxf.end
            print(f"        LINE ({s[0]:.1f},{s[1]:.1f})-({ee[0]:.1f},{ee[1]:.1f})")
        elif t == "LWPOLYLINE":
            print(f"        LWPOLYLINE pts={[tuple(p_) for p_ in ent.get_points('xy')]}")
        elif t in ("TEXT", "MTEXT"):
            txt = ent.dxf.text if t == "TEXT" else ent.text
            print(f"        {t}: {txt}")
        elif t == "INSERT":
            print(f"        INSERT: {ent.dxf.name}")
        else:
            print(f"        {t}")
