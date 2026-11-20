import sys, math, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter, defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

XHS = "$TwtSys$00000545"

def blk_bbox(name, depth=0):
    blk = doc.blocks.get(name)
    xs, ys = [], []
    if blk is None or depth > 4:
        return None
    for e in blk:
        t = e.dxftype()
        try:
            if t == "LINE":
                s, ee = e.dxf.start, e.dxf.end
                xs += [s[0], ee[0]]; ys += [s[1], ee[1]]
            elif t == "CIRCLE":
                c = e.dxf.center; r = e.dxf.radius
                xs += [c[0]-r, c[0]+r]; ys += [c[1]-r, c[1]+r]
            elif t == "LWPOLYLINE":
                for x, y in e.get_points('xy'):
                    xs.append(x); ys.append(y)
            elif t == "SOLID":
                for v in (e.dxf.vtx0, e.dxf.vtx1, e.dxf.vtx2, e.dxf.vtx3):
                    xs.append(v[0]); ys.append(v[1])
            elif t == "INSERT":
                sub = blk_bbox(e.dxf.name, depth+1)
                if sub:
                    xs += [sub[0], sub[2]]; ys += [sub[1], sub[3]]
            elif t in ("TEXT", "MTEXT", "ATTDEF"):
                pt = e.dxf.insert
                xs.append(pt[0]); ys.append(pt[1])
        except Exception:
            pass
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))

# 图框实例
frames = []
for e in msp:
    if e.dxftype() == "INSERT" and "图框" in e.dxf.name:
        bb = blk_bbox(e.dxf.name)
        if bb is None:
            continue
        res = {"name": e.dxf.name, "ins": (e.dxf.insert[0], e.dxf.insert[1]),
               "rot": e.dxf.rotation, "bb": bb}
        frames.append(res)

print("=== 图框块定义 bbox（局部） ===")
for f in frames:
    bb = f["bb"]
    print(f"  {f['name']} @{f['ins']} rot={f['rot']:.1f} bbox_local=({bb[0]:.0f},{bb[1]:.0f})-({bb[2]:.0f},{bb[3]:.0f}) size=({bb[2]-bb[0]:.0f}x{bb[3]-bb[1]:.0f})")

# 收集消火栓
xhs = []
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == XHS:
        xhs.append((e.dxf.insert[0], e.dxf.insert[1], e.dxf.layer))

# 收集所有文字（用于找图名）
def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    return s.replace('\\P', ' ').strip()
texts = []
for e in msp:
    if e.dxftype() == "TEXT":
        texts.append((clean(e.dxf.text or ""), e.dxf.insert[0], e.dxf.insert[1], e.dxf.layer))
    elif e.dxftype() == "MTEXT":
        texts.append((clean(e.text or ""), e.dxf.insert[0], e.dxf.insert[1], e.dxf.layer))

def in_frame(qx, qy, f):
    bb = f["bb"]; px, py = f["ins"]; th = math.radians(f["rot"])
    dx, dy = qx - px, qy - py
    # 逆旋转
    ux = dx*math.cos(-th) - dy*math.sin(-th)
    uy = dx*math.sin(-th) + dy*math.cos(-th)
    return (bb[0] <= ux <= bb[2]) and (bb[1] <= uy <= bb[3])

print("\n=== 各图框内消火栓计数 & 图名文字 ===")
assigned = 0
for i, f in enumerate(frames):
    cnt = 0
    for (x, y, ly) in xhs:
        if in_frame(x, y, f):
            cnt += 1
    assigned += cnt
    # 找图名
    names = []
    for (s, x, y, ly) in texts:
        if ("负一" in s or "负二" in s or "地下一" in s or "地下二" in s) and in_frame(x, y, f):
            names.append(s)
    print(f"  图框{i+1} @{f['ins']} rot={f['rot']:.0f}  消火栓={cnt}")
    for nm in sorted(set(names))[:6]:
        print(f"       图名: {nm}")
print(f"\n合计落入图框: {assigned} / 总消火栓 {len(xhs)}")

# 没落入任何图框的
print("\n=== 未落入任何图框的消火栓坐标分布 ===")
free = [(x, y) for (x, y, ly) in xhs if not any(in_frame(x, y, f) for f in frames)]
print("  数量:", len(free))
if free:
    xs = [q[0] for q in free]; ys = [q[1] for q in free]
    print(f"  X[{min(xs):.0f}~{max(xs):.0f}] Y[{min(ys):.0f}~{max(ys):.0f}]")
