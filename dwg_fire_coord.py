import sys, re, statistics
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter, defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    s = s.replace('\\P', ' ').replace('\\n', ' ')
    return s.strip()

# 1) EQUIP_消火栓 图层实体坐标 + 属性值
xs, ys = [], []
attrib_samples = []
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.layer == "EQUIP_消火栓":
        try:
            ins = e.dxf.insert
        except Exception:
            try:
                ins = e.insert
            except Exception:
                ins = (0,0,0)
        xs.append(ins[0]); ys.append(ins[1])
        # 属性
        try:
            for a in e.attribs:
                val = clean(a.dxf.text)
                if val and len(attrib_samples) < 30:
                    attrib_samples.append((e.dxf.name, val))
        except Exception:
            pass
print("EQUIP_消火栓 INSERT 总数:", len(xs))
if xs:
    print(f"  X范围: {min(xs):.0f} ~ {max(xs):.0f}")
    print(f"  Y范围: {min(ys):.0f} ~ {max(ys):.0f}")
    # 按 X、Y 各分 12 桶看分布
    def hist(vals, lo, hi, n=12):
        w = (hi-lo)/n
        h = [0]*n
        for v in vals:
            idx = min(n-1, max(0, int((v-lo)/w)))
            h[idx]+=1
        return h, w
    hx, wx = hist(xs, min(xs), max(xs))
    print("  X 分布(12桶, 每桶宽%.0f):" % wx)
    for i,c in enumerate(hx):
        print(f"    [{min(xs)+i*wx:.0f}~{min(xs)+(i+1)*wx:.0f}]: {c}")
    hy, wy = hist(ys, min(ys), max(ys))
    print("  Y 分布(12桶, 每桶宽%.0f):" % wy)
    for i,c in enumerate(hy):
        print(f"    [{min(ys)+i*wy:.0f}~{min(ys)+(i+1)*wy:.0f}]: {c}")
print("\n  属性值样例:")
for n,v in attrib_samples[:30]:
    print(f"    {n} -> {v}")

# 2) 含楼层词的大文字坐标（分区标题）
print("\n=== 含 负一层/负二层/地下一层/地下二层 的 TEXT/MTEXT 坐标 ===")
floor_re = re.compile(r'负一|负二|地下一|地下二|地下室.*一|地下室.*二', re.I)
floor_pts = []
for e in msp:
    t = e.dxftype()
    if t in ("TEXT","MTEXT"):
        s = clean(e.dxf.text if t=="TEXT" else e.text)
        if floor_re.search(s):
            pt = e.dxf.insert
            floor_pts.append((s, pt[0], pt[1], e.dxf.layer))
for s,x,y,ly in floor_pts:
    print(f"   [{s}] @({x:.0f},{y:.0f}) 图层={ly}")
print("楼层文字点总数:", len(floor_pts))
