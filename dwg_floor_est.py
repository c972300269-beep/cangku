import sys, re, math
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s); s = s.replace('\\P',' ').replace('\\n',' ')
    return s.strip()
def ins_pt(e):
    try: return e.dxf.insert
    except Exception:
        try: return e.insert
        except Exception: return None

hyd=[]
for e in msp:
    if e.dxftype()=="INSERT" and e.dxf.layer=="EQUIP_消火栓":
        pt=ins_pt(e)
        if pt: hyd.append((pt[0],pt[1]))

floor=[]
for e in msp:
    t=e.dxftype()
    if t in ("TEXT","MTEXT"):
        s=clean(e.dxf.text if t=="TEXT" else e.text)
        if re.search(r'负一层|地下一层',s): floor.append((-1,e.dxf.insert[0],e.dxf.insert[1]))
        elif re.search(r'负二层|地下二层',s): floor.append((-2,e.dxf.insert[0],e.dxf.insert[1]))

cnt=Counter(); dists_by={ -1:[], -2:[] }
for x,y in hyd:
    bd=1e18; bs=None
    for sg,fx,fy in floor:
        d=math.hypot(x-fx,y-fy)
        if d<bd: bd=d; bs=sg
    cnt[bs]+=1; dists_by[bs].append(bd)
print("全归类(最近楼层文字): 负一层=%d 负二层=%d 总=%d"%(cnt[-1],cnt[-2],len(hyd)))
for sg in (-1,-2):
    ds=sorted(dists_by[sg])
    if ds:
        print("  %s 距离 中位%.0f p25%.0f p75%.0f 最大%.0f"%( '负一' if sg==-1 else '负二', ds[len(ds)//2], ds[len(ds)//4], ds[3*len(ds)//4], ds[-1]))

# 按 X 桶看归属一致性
xs=[h[0] for h in hyd]; lo,hi=min(xs),max(xs); n=12; w=(hi-lo)/n
print("\n按X桶 楼层归属一致性:")
for i in range(n):
    seg=[(bs) for x,y in hyd if lo+i*w<=x<lo+(i+1)*w for bs in (cnt and []) ]  # placeholder
# 重新算每桶归属
buck=Counter()
seg_info=[]
for x,y in hyd:
    bd=1e18; bs=None
    for sg,fx,fy in floor:
        d=math.hypot(x-fx,y-fy)
        if d<bd: bd=d; bs=sg
    idx=min(n-1,max(0,int((x-lo)/w)))
    buck[(idx,bs)]+=1
for i in range(n):
    c1=buck.get((i,-1),0); c2=buck.get((i,-2),0)
    seg_info.append((lo+i*w, c1, c2))
for a,c1,c2 in seg_info:
    print("  X[%.0f~%.0f]: 负一%d 负二%d"%(a,a+w,c1,c2))
