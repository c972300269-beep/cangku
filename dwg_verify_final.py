# -*- coding: utf-8 -*-
# 修正版：去掉符号名前导空格；补查 标题栏块 + 图例直接标注
import ezdxf, math, re
from collections import Counter

DXF = ".workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

XHS="$TwtSys$00000545"; BOX="A$C3ECF3B2E"
single_pts=[]; box_pts=[]
for e in msp:
    if e.dxftype()!="INSERT": continue
    n=e.dxf.name
    if n==XHS: single_pts.append((e.dxf.insert[0], e.dxf.insert[1]))
    elif n==BOX: box_pts.append((e.dxf.insert[0], e.dxf.insert[1]))
print("== 修正后 ==")
print("单栓545:",len(single_pts)," 双栓箱:",len(box_pts)," 箱总数:",len(single_pts)+len(box_pts)," 栓口:",len(single_pts)+2*len(box_pts))

# 分区
allx=[p[0] for p in single_pts]+[p[0] for p in box_pts]
xs=sorted(allx); gap=None
for i in range(1,len(xs)):
    if xs[i]-xs[i-1]>200000: gap=(xs[i-1],xs[i]); break
split=(gap[0]+gap[1])/2
print("X间隙:",[round(g/1000,1) for g in gap],"分界X≈",round(split/1000,1),"k")
def L(p): return p[0]<split
L_s=[p for p in single_pts if L(p)]; R_s=[p for p in single_pts if not L(p)]
L_b=[p for p in box_pts if L(p)]; R_b=[p for p in box_pts if not L(p)]
print("左簇: 单%d+双%d -> 箱%d 栓口%d"%(len(L_s),len(L_b),len(L_s)+len(L_b),len(L_s)+2*len(L_b)))
print("右簇: 单%d+双%d -> 箱%d 栓口%d"%(len(R_s),len(R_b),len(R_s)+len(R_b),len(R_s)+2*len(R_b)))
# 间隙附近有没有点
near=[p for p in single_pts+box_pts if abs(p[0]-split)<60000]
print("落在区间±60k内的消火栓数(应≈0):",len(near))

# 文字
texts=[]
for e in msp:
    t=e.dxftype()
    if t in ("TEXT","MTEXT"):
        try: s=e.text if t=="MTEXT" else e.dxf.text
        except: continue
        if not s: continue
        texts.append((e.dxf.insert[0],e.dxf.insert[1],str(s).strip()))
def nearest(x,y,pts):
    bd=1e18;best=None
    for px,py in pts:
        d=math.hypot(px-x,py-y)
        if d<bd: bd=d;best=(px,py)
    return bd,best

# (A) 图例直接标注：找含'室内消火栓'/'消火栓箱'的文字，看最近545距离
print("\n== 图例直接标注核验 ==")
n=0
for x,y,s in texts:
    if ("室内消火栓" in s) or ("消火栓箱" in s) or (s=="消火栓"):
        d5,b5=nearest(x,y,single_pts)
        print(f"  [{s[:16]}] 最近545距离={d5/1000:.2f}k @文字({x/1000:.1f},{y/1000:.1f}k) 符号({b5[0]/1000:.1f},{b5[1]/1000:.1f}k)")
        n+=1
        if n>=20: break
if n==0: print("  (图例区未出现'室内消火栓箱'文字紧邻545)")

# (B) 标题栏块 '开源2地下室给排水平面图5-DM'
print("\n== 标题栏块 开源2地下室给排水平面图5-DM ==")
blk=doc.blocks.get("开源2地下室给排水平面图5-DM")
print("  块是否存在:",blk is not None)
ins=[(e.dxf.insert[0],e.dxf.insert[1]) for e in msp if e.dxftype()=="INSERT" and e.dxf.name=="开源2地下室给排水平面图5-DM"]
print("  插入次数:",len(ins))
for x,y in ins[:25]:
    print(f"    @({x/1000:.1f},{y/1000:.1f}k)")
# 该块内文字
if blk:
    print("  块内实体:")
    for e in blk:
        if e.dxftype() in ("TEXT","MTEXT"):
            try: s=e.text if e.dxftype()=="MTEXT" else e.dxf.text
            except: continue
            if s and len(str(s).strip())>0:
                print("    ",e.dxftype(),repr(str(s).strip()[:30]))

# (C) 各分区楼层/管向词（用修正后的bbox）
def cluster_text(ref,pad=250000):
    xs_=[p[0] for p in ref];ys=[p[1] for p in ref]
    x0,x1=min(xs_)-pad,max(xs_)+pad;y0,y1=min(ys)-pad,max(ys)+pad
    return [s for x,y,s in texts if x0<=x<=x1 and y0<=y<=y1]
Lt=cluster_text(L_s+L_b);Rt=cluster_text(R_s+R_b)
fk=["负一层","负二层","地下一层","地下二层"]
def vote(ts):
    c=Counter()
    for s in ts:
        for k in fk:
            if k in s:c[k]+=1
    return c
pk=["接至负二层","接自地下二层","接至下一层","接自负一层","接上层","接自地下一层","接至负一层"]
def pv(ts):
    c=Counter()
    for s in ts:
        for k in pk:
            if k in s:c[k]+=1
    return c
print("\n左簇楼层词:",dict(vote(Lt))," 管向:",dict(pv(Lt)))
print("右簇楼层词:",dict(vote(Rt))," 管向:",dict(pv(Rt)))
