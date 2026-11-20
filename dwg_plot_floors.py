import sys, math, os
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
fp = r"C:\Windows\Fonts\simhei.ttf"
if os.path.exists(fp):
    font_manager.fontManager.addfont(fp)
    plt.rcParams["font.family"] = font_manager.FontProperties(fname=fp).get_name()
plt.rcParams["axes.unicode_minus"] = False
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
XHS="$TwtSys$00000545"; BOX="A$C3ECF3B2E"
def xf(pt,I,rot,s):
    th=math.radians(rot); x,y=pt[0]*s,pt[1]*s
    return (I[0]+x*math.cos(th)-y*math.sin(th), I[1]+x*math.sin(th)+y*math.cos(th))

boxes=[]  # (x,y,kind)
for e in msp:
    if e.dxftype()!="INSERT": continue
    if e.dxf.name==XHS: boxes.append((e.dxf.insert[0],e.dxf.insert[1],"single"))
    elif e.dxf.name==BOX: boxes.append((e.dxf.insert[0],e.dxf.insert[1],"double"))

xs=sorted(b[0] for b in boxes)
gap_i,best=-1,-1
for i in range(1,len(xs)):
    g=xs[i]-xs[i-1]
    if g>best: best,gap_i=g,i
split=(xs[gap_i-1]+xs[gap_i])/2

fig,ax=plt.subplots(figsize=(16,7))
for x,y,kind in boxes:
    if x<split:
        c="tab:red"; mk="s" if kind=="double" else "o"   # 左大簇 = 负一层 B1
    else:
        c="tab:blue"; mk="s" if kind=="double" else "o"  # 右小簇 = 负二层 B2
    ax.scatter(x,y,s=14 if kind=="single" else 30,c=c,marker=mk,edgecolors="none")
ax.axvline(split,color="black",ls="--",lw=1)
ax.text(split-80000, 0, "分界 X≈%.0f"%split, rotation=90, va="bottom", ha="right", fontsize=9)
# labels
ax.text(250000, 130000, "负一层 B1（大簇）\n478 箱 / 605 栓口", fontsize=13, color="tab:red", fontweight="bold")
ax.text(1000000, 580000, "负二层 B2（小簇）\n201 箱 / 262 栓口", fontsize=13, color="tab:blue", fontweight="bold")
ax.set_xlabel("模型 X 坐标"); ax.set_ylabel("模型 Y 坐标")
ax.set_title("地下室室内消火栓箱分布（蓝=负二层 / 红=负一层；方块=双栓箱，圆点=单栓箱）")
ax.set_aspect("equal","box")
plt.tight_layout()
out=os.path.join(os.path.dirname(p),"..","reports","firebox_floors.png")
os.makedirs(os.path.dirname(out),exist_ok=True)
plt.savefig(out,dpi=110)
print("saved", os.path.abspath(out), "split=",split)
