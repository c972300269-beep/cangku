import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# A) 所有含 消火/消防/栓 的图层（完整）
print("=== 含 消火/消防/栓 的图层(全部) ===")
for l in doc.layers:
    n = l.dxf.name
    if re.search(r'消火|消防|栓|火', n):
        print("   ", n)

# B) 图框块 5-DM / 5-DX / 2015-DX 的插入点 + 块内包围盒
def block_box(bname):
    blk = doc.blocks.get(bname)
    if blk is None: return None
    xs, ys = [], []
    for e in blk:
        t = e.dxftype()
        try:
            if t in ("LINE",):
                xs += [e.dxf.start[0], e.dxf.end[0]]; ys += [e.dxf.start[1], e.dxf.end[1]]
            elif t in ("LWPOLYLINE","POLYLINE"):
                for pt in e.get_points(): xs.append(pt[0]); ys.append(pt[1])
            elif t == "INSERT":
                try: ins=e.dxf.insert
                except Exception:
                    try: ins=e.insert
                    except Exception: ins=None
                if ins: xs.append(ins[0]); ys.append(ins[1])
            elif t=="CIRCLE":
                c=e.dxf.center; r=e.dxf.radius
                xs+=[c[0]-r,c[0]+r]; ys+=[c[1]-r,c[1]+r]
        except Exception: pass
    if xs: return (min(xs),min(ys),max(xs),max(ys),len(xs))
    return (0,0,0,0,0)

for bname in ["开源2地下室给排水平面图5-DM","地下室给排水平面图2015-DX","开源2地下室给排水平面图5-DX",
              "开源2地下室给排水平面图5-111","开源2地下室给排水平面图5-222"]:
    ins_pts = []
    for e in msp:
        if e.dxftype()=="INSERT" and e.dxf.name==bname:
            try: ins=e.dxf.insert
            except Exception:
                try: ins=e.insert
                except Exception: ins=None
            if ins: ins_pts.append((ins[0],ins[1]))
    bb = block_box(bname)
    print(f"\n图框块 {bname}: 插入次数={len(ins_pts)} 块内包围盒={bb}")
    if ins_pts:
        xs=[a for a,b in ins_pts]; ys=[b for a,b in ins_pts]
        print(f"   插入点 X[{min(xs):.0f}~{max(xs):.0f}] Y[{min(ys):.0f}~{max(ys):.0f}]")
        for pt in ins_pts[:6]:
            print(f"     ({pt[0]:.0f},{pt[1]:.0f})")
