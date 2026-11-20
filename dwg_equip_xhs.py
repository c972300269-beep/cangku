import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter, defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

target = "EQUIP_消火栓"
print("=== 图层", target, "上的实体统计 ===")
types = Counter()
circles = []
lines = []
for e in msp:
    if e.dxf.layer == target:
        t = e.dxftype()
        types[t] += 1
        if t == "CIRCLE":
            c = e.dxf.center
            circles.append((c[0], c[1], e.dxf.radius))
        elif t == "LINE":
            lines.append(e)
for k, v in types.most_common():
    print(f"   {k}: {v}")

print(f"\n圆(CIRCLE)总数: {len(circles)}")
if circles:
    xs = [c[0] for c in circles]; ys = [c[1] for c in circles]
    print(f"  X范围 [{min(xs):.0f} ~ {max(xs):.0f}]")
    print(f"  Y范围 [{min(ys):.0f} ~ {max(ys):.0f}]")
    rs = Counter(round(c[2]) for c in circles)
    print("  半径分布:", dict(rs))

# 看这个图层上所有图层名（含"消火栓"的其他图层）
print("\n=== 所有含'消火栓'或'EQUIP'的图层 ===")
for l in doc.layers:
    n = l.dxf.name
    if ('消火栓' in n) or ('EQUIP' in n.upper()):
        print("   ", n)

# 该图层上实体的图层名去重里有没有别的
# 统计每个"消火栓相关图层"上的CIRCLE数
print("\n=== 各消火栓/消防图层上的实体类型统计 ===")
layer_types = defaultdict(Counter)
for e in msp:
    ln = e.dxf.layer
    if ('消火栓' in ln) or ('EQUIP_消防' in ln) or ('消防' in ln and 'PIPE' not in ln and 'VPIPE' not in ln and 'TEXT' not in ln):
        layer_types[ln][e.dxftype()] += 1
for ln, c in layer_types.items():
    print(f"   图层 {ln}: {dict(c)}")
