import sys
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

for bn in ["$TwtSys$00000545", "A$C3ECF3B2E"]:
    print("=" * 70)
    print("块:", bn)
    lay = Counter()
    xs, ys = [], []
    insts = []
    for e in msp:
        if e.dxftype() == "INSERT" and e.dxf.name == bn:
            lay[e.dxf.layer] += 1
            xs.append(e.dxf.insert[0]); ys.append(e.dxf.insert[1])
            insts.append((e.dxf.insert[0], e.dxf.insert[1], e.dxf.layer))
    print("  总实例:", sum(lay.values()))
    print("  图层分布:", dict(lay))
    if xs:
        print(f"  X范围[{min(xs):.0f}~{max(xs):.0f}]  Y范围[{min(ys):.0f}~{max(ys):.0f}]")
    # 按 X 分箱看分布密度
    if xs:
        import math
        x0, x1 = min(xs), max(xs)
        bins = 12
        cnt = [0]*bins
        for x in xs:
            i = min(bins-1, int((x-x0)/(x1-x0+1e-9)*bins))
            cnt[i] += 1
        print("  X方向分箱计数:", cnt)
        y0, y1 = min(ys), max(ys)
        cnt2 = [0]*bins
        for y in ys:
            i = min(bins-1, int((y-y0)/(y1-y0+1e-9)*bins))
            cnt2[i] += 1
        print("  Y方向分箱计数:", cnt2)
