# -*- coding: utf-8 -*-
"""Clean, consistent recompute of hydrant counts per cluster + verify double-box extraction."""
import sys, math
sys.path.insert(0, "C:/Users/chenjialin3/.workbuddy/tmp/dwg/pylibs")
import ezdxf
from ezdxf.math import Matrix44

DXF = ".workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(DXF)
msp = doc.modelspace()
XHS="$TwtSys$00000545"; BOX="A$C3ECF3B2E"

# verify counts
n_single=sum(1 for e in msp if e.dxftype()=="INSERT" and e.dxf.name==XHS)
n_box=sum(1 for e in msp if e.dxftype()=="INSERT" and e.dxf.name==BOX)
print("top-level single XHS inserts =", n_single)
print("top-level BOX inserts =", n_box)

def box_545(insert):
    pts=[]; blk=doc.blocks.get(insert.dxf.name)
    if blk is None: return pts
    def walk(ents,M):
        for e in ents:
            if e.dxftype()=="INSERT":
                ins=e.dxf.insert
                sx=e.dxf.xscale if hasattr(e.dxf,'xscale') else 1.0
                sy=e.dxf.yscale if hasattr(e.dxf,'yscale') else 1.0
                rot=e.dxf.rotation if hasattr(e.dxf,'rotation') else 0.0
                M2=M*Matrix44.scale(sx,sy,1)*Matrix44.z_rotate(math.radians(rot))*Matrix44.translate(ins[0],ins[1],ins[2])
                if e.dxf.name==XHS:
                    p=M2.transform((0,0,0)); pts.append((p[0],p[1]))
                else:
                    b2=doc.blocks.get(e.dxf.name)
                    if b2 is not None: walk(b2,M2)
    ins=insert.dxf.insert
    sx=insert.dxf.xscale if hasattr(insert.dxf,'xscale') else 1.0
    sy=insert.dxf.yscale if hasattr(insert.dxf,'yscale') else 1.0
    rot=insert.dxf.rotation if hasattr(insert.dxf,'rotation') else 0.0
    M0=Matrix44.scale(sx,sy,1)*Matrix44.z_rotate(math.radians(rot))*Matrix44.translate(ins[0],ins[1],ins[2])
    walk(blk,M0); return pts

box_outlets=[]  # list of (x,y, box_x, box_y) for each 545 inside a box
for e in msp:
    if e.dxftype()=="INSERT" and e.dxf.name==BOX:
        for (x,y) in box_545(e):
            box_outlets.append((x,y,e.dxf.insert[0],e.dxf.insert[1]))

print("total 545 outlets inside boxes =", len(box_outlets), "(expect %d)"%(n_box*2))

# all outlets (single + box)
single_pts=[(e.dxf.insert[0],e.dxf.insert[1]) for e in msp if e.dxftype()=="INSERT" and e.dxf.name==XHS]
all_outlets=single_pts+[(p[0],p[1]) for p in box_outlets]
print("TOTAL outlets =", len(all_outlets))

# cluster by X gap
xs=sorted(set(round(p[0]) for p in all_outlets))
gap=(0,0,0); prev=xs[0]
for x in xs[1:]:
    g=x-prev
    if g>gap[0]: gap=(g,prev,x)
    prev=x
split=(gap[1]+gap[2])/2
print("gap=%.0f between %.0f and %.0f ; split=%.0f"%(gap[0],gap[1],gap[2],split))

# per cluster: count singles, boxes, outlets
def inL(x): return x<split
L_single=sum(1 for (x,y) in single_pts if inL(x))
R_single=sum(1 for (x,y) in single_pts if not inL(x))
L_box=sum(1 for (x,y,bx,by) in box_outlets if inL(bx))
R_box=sum(1 for (x,y,bx,by) in box_outlets if not inL(bx))
L_out=L_single+2*L_box
R_out=R_single+2*R_box
print("\n--- BOX counts (1 double box = 1 box, 2 outlets) ---")
print("LEFT : boxes=%d (single %d + double %d)  outlets=%d"%(L_single+L_box, L_single, L_box, L_out))
print("RIGHT: boxes=%d (single %d + double %d)  outlets=%d"%(R_single+R_box, R_single, R_box, R_out))
print("TOTAL: boxes=%d  outlets=%d"%(L_single+L_box+R_single+R_box, L_out+R_out))

# clean separation check: any outlet within 50k of split?
near=[p for p in all_outlets if abs(p[0]-split)<50000]
print("\noutlets within 50k of split line:", len(near), "(0 = clean gap)")
