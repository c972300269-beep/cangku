import sys, math, re
sys.path.insert(0, r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/pylibs")
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif']=['Microsoft YaHei','SimHei']; plt.rcParams['axes.unicode_minus']=False
import ezdxf
p=r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc=ezdxf.readfile(p); msp=doc.modelspace()
OUT=r"E:/workbuddy/Claw/.workbuddy/tmp/dwg"
def ap(pt,prm):
    (Ix,Iy),th,s,(bx,by)=prm; x,y=pt[0]-bx,pt[1]-by; c,si=math.cos(th),math.sin(th)
    return (Ix+(x*c-y*si)*s, Iy+(x*si+y*c)*s)
def tw(pt,st):
    for prm in reversed(st): pt=ap(pt,prm)
    return pt
def ins(pt,R): return R[0]<=pt[0]<=R[1] and R[2]<=pt[1]<=R[3]
def draw(ents,st,ax,R,d=0):
    if d>4: return
    for e in ents:
        t=e.dxftype()
        try:
            if t=="INSERT":
                I=(e.dxf.insert[0],e.dxf.insert[1]); W=tw(I,st)
                if not ins(W,R): continue
                sub=doc.blocks.get(e.dxf.name)
                if sub is None: continue
                if e.dxf.name=="$TwtSys$00000545": ax.plot([W[0]],[W[1]],'r+',ms=3)
                draw(sub, st+[(I,math.radians(e.dxf.rotation),e.dxf.xscale or 1.0,(0,0))],ax,R,d+1)
            elif t=="LINE":
                a=tw((e.dxf.start[0],e.dxf.start[1]),st); b=tw((e.dxf.end[0],e.dxf.end[1]),st)
                if ins(a,R) or ins(b,R): ax.plot([a[0],b[0]],[a[1],b[1]],'k-',lw=0.7)
            elif t=="LWPOLYLINE":
                P=[tw((x,y),st) for x,y in e.get_points('xy')]
                if any(ins(q,R) for q in P): ax.plot([q[0] for q in P],[q[1] for q in P],'-',color='0.4',lw=0.6)
            elif t=="CIRCLE":
                c=tw((e.dxf.center[0],e.dxf.center[1]),st)
                if ins(c,R):
                    s=abs(st[-1][2]) if st else 1.0
                    ax.add_patch(plt.Circle(c,e.dxf.radius*s,fill=False,ec='k',lw=0.7))
            elif t in ("TEXT","MTEXT"):
                s=e.dxf.text if t=="TEXT" else e.text
                s=re.sub(r'\\([A-Za-z]+)[^;]*;','',s or ""); s=re.sub(r'[{}]','',s).replace('\\P',' ').strip()
                if s:
                    pt=tw((e.dxf.insert[0],e.dxf.insert[1]),st)
                    if ins(pt,R): ax.text(pt[0],pt[1],s,fontsize=5,color='blue')
        except Exception: pass
def render(R,fn,tt):
    fig,ax=plt.subplots(figsize=(10,10),dpi=170)
    draw(msp,[],ax,R); ax.set_xlim(R[0],R[1]); ax.set_ylim(R[2],R[3]); ax.set_aspect('equal'); ax.set_title(tt)
    fig.savefig(fn,bbox_inches='tight'); plt.close(fig); print("saved",fn)
render((262100,264100,-168900,-166900), OUT+r"\micro_box.png","A$C3ECF3B2E 位置特写")
render((250100,252100,-148900,-146900), OUT+r"\micro_single.png","某单栓位置特写")
