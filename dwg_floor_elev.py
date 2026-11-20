import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
XHS="$TwtSys$00000545"; BOX="A$C3ECF3B2E"

def xf(pt,I,rot,s):
    th=__import__("math").radians(rot); x,y=pt[0]*s,pt[1]*s
    return (I[0]+x*math.cos(th)-y*math.sin(th), I[1]+x*math.sin(th)+y*math.cos(th))

# box representative points + split
boxes=[]
for e in msp:
    if e.dxftype()!="INSERT": continue
    if e.dxf.name==XHS: boxes.append((e.dxf.insert[0],e.dxf.insert[1],"single"))
    elif e.dxf.name==BOX: boxes.append((e.dxf.insert[0],e.dxf.insert[1],"double"))
xs=sorted(b[0] for b in boxes)
best,gap_i=-1,-1
for i in range(1,len(xs)):
    g=xs[i]-xs[i-1]
    if g>best: best,gap_i=g,i
split=(xs[gap_i-1]+xs[gap_i])/2
left=[b for b in boxes if b[0]<split]; right=[b for b in boxes if b[0]>=split]
print("split X=",split)
print("左簇箱",len(left)," 右簇箱",len(right))

# all text
def text_of(e):
    try:
        if e.dxftype()=="TEXT": return e.dxf.text or ""
        if e.dxftype()=="MTEXT": return e.text or ""
        if e.dxftype()=="ATTRIB": return e.dxf.text or ""
    except: return ""
    return ""
texts=[]
for e in msp:
    t=text_of(e)
    if not t: continue
    try: x,y=e.dxf.insert[0],e.dxf.insert[1]
    except: continue
    texts.append((x,y,getattr(e.dxf,"layer",""),t.strip()))

def in_box(items,x0,x1,y0,y1,m=0):
    return [t for t in items if (x0-m)<=t[0]<=(x1+m) and (y0-m)<=t[1]<=(y1+m)]

Lx0,Lx1,Ly0,Ly1=min(b[0] for b in left),max(b[0] for b in left),min(b[1] for b in left),max(b[1] for b in left)
Rx0,Rx1,Ry0,Ry1=min(b[0] for b in right),max(b[0] for b in right),min(b[1] for b in right),max(b[1] for b in right)

# 1) 标高 文本
print("\n===== 含'标高'的文本(全图) =====")
for t in texts:
    if "标高" in t[3] or "H=" in t[3] or "▽" in t[3]:
        if len(t[3])<50:
            print(f"  ({round(t[0])},{round(t[1])}) {t[3]}")

# 2) 负标高数值 (含 -X.XXX 或 X.XXX 配'标高')
print("\n===== 负标高数值 (全图, 范围 -12~0) =====")
seen=set()
for t in texts:
    for mm in re.findall(r"-?\d+\.\d{2,4}", t[3]):
        v=float(mm)
        if -12<v<0:
            key=(round(v,2),t[3][:24])
            if key not in seen:
                seen.add(key)
                print(f"  ({round(t[0])},{round(t[1])}) v={v}  ctx={t[3][:30]}")
print("  (若上方为空, 说明平面图内无负标高数值)")

# 3) 每个簇内, 含'层'或'平面图'或'给排水'或'地下'的图名类文本
for name,(x0,x1,y0,y1) in [("左簇",(Lx0,Lx1,Ly0,Ly1)),("右簇",(Rx0,Rx1,Ry0,Ry1))]:
    near=in_box(texts,x0,x1,y0,y1,80000)
    floorish=[t for t in near if any(k in t[3] for k in ["层","平面图","给排","地下","消火栓","消防"])]
    print(f"\n===== {name} 内 图名/楼层类文本 (共{len(floorish)}条, 去重展示) =====")
    uniq=Counter(t[3] for t in floorish)
    for s,c in uniq.most_common(40):
        print(f"   [{c:>3}] {s[:46]}")
