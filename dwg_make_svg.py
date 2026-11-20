import sys, re, math, os
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s); s=re.sub(r'[{}]','',s)
    s=s.replace('\\P',' ').replace('\\n',' '); return s.strip()
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
        if re.search(r'负一层|地下一层',s): floor.append((-1,e.dxf.insert[0],e.dxf.insert[1],s))
        elif re.search(r'负二层|地下二层',s): floor.append((-2,e.dxf.insert[0],e.dxf.insert[1],s))

# 最近楼层文字归类
cls=[]
for x,y in hyd:
    bd=1e18; bs=None
    for sg,fx,fy,s in floor:
        d=math.hypot(x-fx,y-fy)
        if d<bd: bd=d; bs=sg
    cls.append(bs)

xs=[h[0] for h in hyd]; ys=[h[1] for h in hyd]
minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
W,H=1600,1000
def tx(x): return 40+(x-minx)/(maxx-minx)*(W-80)
def ty(y): return H-40-(y-miny)/(maxy-miny)*(H-80)  # Y向上

svg=[]
svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="11">')
svg.append(f'<rect width="{W}" height="{H}" fill="#0f1420"/>')
svg.append(f'<text x="20" y="24" fill="#fff" font-size="16">飞来湖北地块 地下室消火栓箱分布 (EQUIP_消火栓 共{len(hyd)}个)</text>')
svg.append(f'<text x="20" y="{H-12}" fill="#ffb74d">橙点=全部消火栓箱(332)  红字=负一层标注  蓝字=负二层标注  (图面未分楼层子图层,仅供看分布)</text>')
# 消火栓箱 统一橙色
for (x,y),sg in zip(hyd,cls):
    svg.append(f'<circle cx="{tx(x):.1f}" cy="{ty(y):.1f}" r="3.2" fill="#ffb74d"/>')
# 楼层文字
for sg,fx,fy,s in floor:
    col='#ff5a5a' if sg==-1 else '#4aa3ff'
    svg.append(f'<text x="{tx(fx):.1f}" y="{ty(fy):.1f}" fill="{col}">{s[:16]}</text>')
    svg.append(f'<circle cx="{tx(fx):.1f}" cy="{ty(fy):.1f}" r="4" fill="none" stroke="{col}" stroke-width="1.5"/>')
svg.append('</svg>')
out=os.path.join(r"E:\workbuddy\Claw\reports","fire_layout.svg")
os.makedirs(os.path.dirname(out),exist_ok=True)
open(out,"w",encoding="utf-8").write("\n".join(svg))
print("SVG写至",out)
# 统计
from collections import Counter
c=Counter(cls)
print("最近标注归类: 负一层=%d 负二层=%d"%(c[-1],c[-2]))
print("坐标范围 X[%.0f~%.0f] Y[%.0f~%.0f]"%(minx,maxx,miny,maxy))
