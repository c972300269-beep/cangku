import sys, math, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
XHS = "$TwtSys$00000545"; BOX = "A$C3ECF3B2E"

def xf(pt, I, rot_deg, s):
    th = math.radians(rot_deg)
    x, y = pt[0]*s, pt[1]*s
    return (I[0] + x*math.cos(th) - y*math.sin(th), I[1] + x*math.sin(th) + y*math.cos(th))

# ---- 1. collect hydrant boxes (single + double) with a representative world point ----
boxes = []   # (x, y, kind)  kind: 'single' / 'double'
for e in msp:
    if e.dxftype() != "INSERT": continue
    if e.dxf.name == XHS:
        boxes.append((e.dxf.insert[0], e.dxf.insert[1], "single"))
    elif e.dxf.name == BOX:
        # representative = box insert point (center-ish)
        boxes.append((e.dxf.insert[0], e.dxf.insert[1], "double"))

# double box inner outlets (for outlet count + cluster of outlets)
outlets = []
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == XHS:
        outlets.append((e.dxf.insert[0], e.dxf.insert[1]))
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == BOX:
        I = (e.dxf.insert[0], e.dxf.insert[1]); rot = e.dxf.rotation; s = e.dxf.xscale or 1.0
        blk = doc.blocks.get(BOX)
        for sub in blk:
            if sub.dxftype() == "INSERT" and sub.dxf.name == XHS:
                loc = (sub.dxf.insert[0], sub.dxf.insert[1])
                w = xf(loc, I, rot + sub.dxf.rotation, s * (sub.dxf.xscale or 1.0))
                outlets.append((w[0], w[1]))

print("单栓箱(顶层545):", sum(1 for b in boxes if b[2]=="single"))
print("双栓箱(AC3E):", sum(1 for b in boxes if b[2]=="double"))
print("消火栓箱总数:", len(boxes))
print("消火栓栓口总数:", len(outlets))

# ---- 2. cluster by largest X gap among box representative points ----
xs = sorted(b[0] for b in boxes)
# find biggest gap
gap_i, best = -1, -1
for i in range(1, len(xs)):
    g = xs[i]-xs[i-1]
    if g > best: best, gap_i = g, i
split = (xs[gap_i-1] + xs[gap_i]) / 2
print(f"\n最大X间隙={best:.0f} @ x≈{xs[gap_i-1]:.0f}~{xs[gap_i]:.0f}  分界X={split:.0f}")

left = [b for b in boxes if b[0] < split]
right = [b for b in boxes if b[0] >= split]
print(f"左簇: {len(left)} 箱  (单{sum(1 for b in left if b[2]=='single')} 双{sum(1 for b in left if b[2]=='double')})")
print(f"右簇: {len(right)} 箱 (单{sum(1 for b in right if b[2]=='single')} 双{sum(1 for b in right if b[2]=='double')})")

# outlet counts per cluster
lo = sum(1 for o in outlets if o[0] < split)
ro = sum(1 for o in outlets if o[0] >= split)
print(f"左簇栓口: {lo}   右簇栓口: {ro}")

# ---- 3. extract ALL text with coords ----
def text_of(e):
    try:
        if e.dxftype() == "TEXT": return e.dxf.text or ""
        if e.dxftype() == "MTEXT": return e.text or ""
        if e.dxftype() == "ATTRIB": return e.dxf.text or ""
    except Exception: return ""
    return ""

texts = []  # (x, y, layer, content)
for e in msp:
    t = text_of(e)
    if not t: continue
    try:
        if e.dxftype() == "MTEXT":
            x, y = e.dxf.insert[0], e.dxf.insert[1]
        else:
            x, y = e.dxf.insert[0], e.dxf.insert[1]
    except Exception:
        continue
    texts.append((x, y, getattr(e.dxf, "layer", ""), t))

# floor keywords
kw_floor = ["负一层", "负二层", "地下一层", "地下二层", "负1层", "负2层", "B1", "B2"]

def cluster_bbox(items):
    if not items: return None
    xs_ = [i[0] for i in items]; ys_ = [i[1] for i in items]
    return (min(xs_), max(xs_), min(ys_), max(ys_))

def evidence(items, name):
    bx0, bx1, by0, by1 = cluster_bbox(items)
    # expand margin 80k
    m = 80000
    near = [t for t in texts if (bx0-m) <= t[0] <= (bx1+m) and (by0-m) <= t[1] <= (by1+m)]
    print(f"\n===== {name} 区域证据 (X[{bx0:.0f},{bx1:.0f}] Y[{by0:.0f},{by1:.0f}]) =====")
    print(f"  附近文本总数: {len(near)}")
    cnt = Counter()
    samples = []
    for t in near:
        c = t[3]
        for kw in kw_floor:
            if kw in c:
                cnt[kw] += 1
                if len(samples) < 12: samples.append((kw, round(t[0]), round(t[1]), c.strip()[:40]))
    print("  楼层关键词计数:", dict(cnt))
    print("  样本:")
    for s in samples:
        print("    ", s)
    # elevation numbers like -5.xxx / -9.xxx
    elevs = []
    for t in near:
        for mm in re.findall(r"-?\d+\.\d{2,3}", t[3]):
            v = float(mm)
            if -12 < v < 0:
                elevs.append((v, t[3].strip()[:30]))
    # tally negative elevations by decade
    neg = Counter()
    for v, _ in elevs:
        if -6 < v <= -4: neg["负一层级(-4~-6)"] += 1
        elif -11 < v <= -6: neg["负二层级(-6~-11)"] += 1
    print("  负标高分布:", dict(neg))
    print("  负标高样本:", elevs[:15])

evidence(left, "左簇")
evidence(right, "右簇")

# also dump ALL floor-label texts with coords (to see spatial layout of titles)
print("\n===== 所有含楼层/地下 字样文本(坐标) =====")
for t in sorted(texts, key=lambda z: (round(z[1],-3), round(z[0],-3))):
    c = t[3]
    if any(k in c for k in ["负一层","负二层","地下一层","地下二层","负1","负2","地下车库","地下室"]) and ("层" in c or "室" in c or "下" in c):
        if len(c) < 60:
            print(f"  ({round(t[0]):>9},{round(t[1]):>9}) [{t[2]}] {c.strip()[:50]}")
