import sys, re, math
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    s = s.replace('\\P', ' ').replace('\\n', ' ')
    return s.strip()

def ins_pt(e):
    try:
        return e.dxf.insert
    except Exception:
        try:
            return e.insert
        except Exception:
            return None

# 消火栓箱坐标（EQUIP_消火栓 图层）
hyd = []
for e in msp:
    if e.dxftype()=="INSERT" and e.dxf.layer=="EQUIP_消火栓":
        pt = ins_pt(e)
        if pt: hyd.append((pt[0], pt[1], e.dxf.name))

# 楼层文字：明确负一/负二
floor_pts = []  # (sign, x, y, text)
for e in msp:
    t = e.dxftype()
    if t in ("TEXT","MTEXT"):
        s = clean(e.dxf.text if t=="TEXT" else e.text)
        if not s: continue
        if re.search(r'负一层|地下一层', s):
            pt = e.dxf.insert; floor_pts.append((-1, pt[0], pt[1], s))
        elif re.search(r'负二层|地下二层', s):
            pt = e.dxf.insert; floor_pts.append((-2, pt[0], pt[1], s))

print("消火栓箱总数:", len(hyd))
print("楼层文字(-1/-2):", len(floor_pts))
print("\n--- 楼层文字坐标 ---")
for sg,x,y,s in floor_pts:
    print(f"  {'负一' if sg==-1 else '负二'} ({x:.0f},{y:.0f}) {s[:30]}")

# 最近楼层文字
THRESH = 60000  # 判定阈值(单位)
cnt = Counter()
uncls = 0
detail = []
for x,y,name in hyd:
    best_d = 1e18; best_sg=None; best_s=None
    for sg,fx,fy,s in floor_pts:
        d = math.hypot(x-fx, y-fy)
        if d < best_d:
            best_d = d; best_sg = sg; best_s = s
    if best_d <= THRESH:
        cnt[best_sg]+=1
        detail.append((best_sg, best_d, name))
    else:
        uncls += 1
print(f"\n=== 最近楼层文字分类 (阈值={THRESH}) ===")
print("负一层:", cnt[-1], " 负二层:", cnt[-2], " 未归类:", uncls)
# 距离分布
dists = []
for x,y,name in hyd:
    bd=min(math.hypot(x-fx,y-fy) for sg,fx,fy,s in floor_pts)
    dists.append(bd)
dists.sort()
print("\n最近距离分位数: min%.0f p10%.0f p25%.0f p50%.0f p75%.0f p90%.0f max%.0f" % (
    dists[0], dists[len(dists)//10], dists[len(dists)//4], dists[len(dists)//2],
    dists[3*len(dists)//4], dists[9*len(dists)//10], dists[-1]))
