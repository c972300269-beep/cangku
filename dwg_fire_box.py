import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter, defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# INSERT 图块名 + 计数
inserts = Counter()
for e in msp:
    if e.dxftype() == "INSERT":
        inserts[e.dxf.name] += 1
print("=== 全部 INSERT 图块 (共", len(inserts), "种) ===")
for k, v in inserts.most_common():
    print(f"   {k}: {v}")

# 消防相关图块（按名称）
fire_re = re.compile(r'消|火|栓|XHS|XH[0-9]|FIRE|HYD|箱|SG|SS|消火栓|灭火', re.I)
print("\n=== 名称含消防/箱 的 INSERT 图块 ===")
fire_blocks = {k: v for k, v in inserts.items() if fire_re.search(k)}
for k, v in sorted(fire_blocks.items(), key=lambda x: -x[1]):
    print(f"   {k}: {v}")
print("消防相关图块合计引用数:", sum(fire_blocks.values()))

# 这些消防块所在图层 + 坐标范围
print("\n=== 消防相关图块的 图层分布 / 坐标范围 ===")
block_layer = defaultdict(Counter)
block_ext = defaultdict(lambda: [1e9, 1e9, -1e9, -1e9])  # minx,miny,maxx,maxy
for e in msp:
    if e.dxftype() == "INSERT" and fire_re.search(e.dxf.name):
        name = e.dxf.name
        blk = doc.blocks.get(e.dxf.name)
        try:
            ins = e.insert
            x, y = ins[0], ins[1]
        except Exception:
            x, y = 0, 0
        block_layer[name][e.dxf.layer] += 1
        ext = block_ext[name]
        ext[0] = min(ext[0], x); ext[1] = min(ext[1], y)
        ext[2] = max(ext[2], x); ext[3] = max(ext[3], y)
for name in sorted(fire_blocks):
    print(f"\n  块名 {name} (引用 {fire_blocks[name]}):")
    for ly, c in block_layer[name].most_common():
        print(f"     图层 {ly}: {c}")
    ext = block_ext[name]
    if ext[2] > -1e8:
        print(f"     坐标X[{ext[0]:.0f}~{ext[2]:.0f}] Y[{ext[1]:.0f}~{ext[3]:.0f}]")

# 楼层图名文字坐标（用于划分区域）
def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    s = s.replace('\\P', ' ').replace('\\n', ' ')
    return s.strip()
print("\n=== 楼层图名文字（地下一/二层、负一/二层）及其坐标 ===")
floor_re = re.compile(r'地下一|地下二|负一|负二|地下室.*一层|地下室.*二层|地下车库.*一|地下车库.*二', re.I)
for e in msp:
    t = e.dxftype()
    s = ""
    if t == "TEXT":
        s = clean(e.dxf.text or "")
        pt = e.dxf.insert
    elif t == "MTEXT":
        s = clean(e.text or "")
        pt = e.dxf.insert
    else:
        continue
    if floor_re.search(s):
        print(f"   [{s}] @ ({pt[0]:.0f},{pt[1]:.0f}) 图层={e.dxf.layer}")
