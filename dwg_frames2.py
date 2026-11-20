# -*- coding: utf-8 -*-
"""Find per-sheet title blocks / frames inside each hydrant cluster to definitively map floors.
Looks for: (1) ATTRIB/ATTDEF text (title-block attributes), (2) large rectangular frames,
(3) INSERT blocks whose definition contains floor/sheet text."""
import sys, math
sys.path.insert(0, "C:/Users/chenjialin3/.workbuddy/tmp/dwg/pylibs")
import ezdxf
from ezdxf.math import Matrix44

DXF = ".workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

XHS = "$TwtSys$00000545"
BOX = "A$C3ECF3B2E"

def wcs_545_in_box(insert):
    pts = []
    blk = doc.blocks.get(insert.dxf.name)
    if blk is None: return pts
    def walk(ents, M):
        for e in ents:
            if e.dxftype() == "INSERT":
                ins = e.dxf.insert
                sx = e.dxf.xscale if hasattr(e.dxf,'xscale') else 1.0
                sy = e.dxf.yscale if hasattr(e.dxf,'yscale') else 1.0
                rot = e.dxf.rotation if hasattr(e.dxf,'rotation') else 0.0
                M2 = M * Matrix44.scale(sx,sy,1) * Matrix44.z_rotate(math.radians(rot)) * Matrix44.translate(ins[0],ins[1],ins[2])
                if e.dxf.name == XHS:
                    p = M2.transform((0,0,0)); pts.append((p[0],p[1]))
                else:
                    b2 = doc.blocks.get(e.dxf.name)
                    if b2 is not None: walk(b2, M2)
    ins = insert.dxf.insert
    sx = insert.dxf.xscale if hasattr(insert.dxf,'xscale') else 1.0
    sy = insert.dxf.yscale if hasattr(insert.dxf,'yscale') else 1.0
    rot = insert.dxf.rotation if hasattr(insert.dxf,'rotation') else 0.0
    M0 = Matrix44.scale(sx,sy,1)*Matrix44.z_rotate(math.radians(rot))*Matrix44.translate(ins[0],ins[1],ins[2])
    walk(blk, M0)
    return pts

single=[]; double=[]
for e in msp:
    if e.dxftype()!="INSERT": continue
    if e.dxf.name==XHS: single.append((e.dxf.insert[0],e.dxf.insert[1]))
    elif e.dxf.name==BOX: double.extend(wcs_545_in_box(e))
allpts=single+double
xs=sorted(set(round(p[0]) for p in allpts))
gap=(0,0,0); prev=xs[0]
for x in xs[1:]:
    g=x-prev
    if g>gap[0]: gap=(g,prev,x)
    prev=x
split=(gap[1]+gap[2])/2
print("split X = %.0f  LEFT=%d RIGHT=%d"%(split, sum(1 for p in allpts if p[0]<split), sum(1 for p in allpts if p[0]>=split)))

def binof(x): return "L" if x<split else "R"

# 1) ATTRIB / ATTDEF text
print("\n=== ATTRIB / ATTDEF text (title-block attributes) inside clusters ===")
att=[]
for e in msp:
    t=e.dxftype()
    if t in ("ATTRIB","ATTDEF"):
        s=e.dxf.text
        try: x=e.dxf.insert[0]; y=e.dxf.insert[1]
        except: continue
        if "负一" in s or "负二" in s or "地下一" in s or "地下二" in s or "A1-" in s or "A2-" in s or "放大" in s or "给排水" in s:
            att.append((binof(x),(x,y),s.strip()))
for b,pt,s in sorted(att,key=lambda r:(r[0],r[1][1])):
    print("  [%s] (%.0f,%.0f) %s"%(b,pt[0],pt[1],s[:50]))

# 2) Large rectangular frames (closed polylines, ~orthogonal, large area)
print("\n=== Candidate sheet frames (large rectangles) ===")
frames=[]
for e in msp:
    if e.dxftype()!="LWPOLYLINE": continue
    if not e.closed: continue
    pts=list(e.get_points())
    if len(pts)<4: continue
    xs_=[p[0] for p in pts]; ys_=[p[1] for p in pts]
    w=max(xs_)-min(xs_); h=max(ys_)-min(ys_)
    area=w*h
    # orthogonal-ish: bbox area ~ polygon area
    if area<5e9: continue   # skip small rooms (<~70000x70000)
    # aspect filter: sheet-like
    if w<30000 or h<20000: continue
    cx=(min(xs_)+max(xs_))/2; cy=(min(ys_)+max(ys_))/2
    frames.append((binof(cx),(cx,cy),w,h))
print("  total frames found:",len(frames))
for b,c,w,h in sorted(frames,key=lambda r:(r[0],r[1][1])):
    print("  [%s] center(%.0f,%.0f)  %.0f x %.0f"%(b,c[0],c[1],w,h))

# 3) INSERT blocks whose DEFINITION contains floor/sheet text (title blocks)
print("\n=== INSERT blocks whose definition text mentions floor/sheet ===")
def blk_has_floortext(bname):
    blk=doc.blocks.get(bname)
    if blk is None: return False
    for e in blk:
        t=e.dxftype()
        s=""
        if t=="TEXT": s=e.dxf.text
        elif t=="MTEXT": s=e.text
        elif t in ("ATTRIB","ATTDEF"): s=e.dxf.text
        if s and ("负一" in s or "负二" in s or "地下一" in s or "地下二" in s or "放大平面" in s or "给排水及消火栓" in s):
            return True
    return False

title_blocks=set()
for e in msp:
    if e.dxftype()!="INSERT": continue
    if blk_has_floortext(e.dxf.name):
        title_blocks.add(e.dxf.name)
print("  title-block block names:",list(title_blocks))
for tn in title_blocks:
    positions=[]
    for e in msp:
        if e.dxftype()=="INSERT" and e.dxf.name==tn:
            positions.append((e.dxf.insert[0],e.dxf.insert[1]))
    print("  block %s : %d instances"%(tn,len(positions)))
    for x,y in sorted(positions,key=lambda p:p[1])[:30]:
        print("     (%.0f,%.0f) [%s]"%(x,y,binof(x)))
