import sys, math
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# 直接读取块定义几何并手绘
import ezdxf
p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
OUT = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg"

def collect(blk, depth=0):
    """返回几何元素列表: ('line',p1,p2),('circle',c,r),('poly',pts,closed),('solid',pts)"""
    items = []
    if depth > 3:
        return items
    for e in blk:
        t = e.dxftype()
        try:
            if t == "LINE":
                items.append(("line", tuple(e.dxf.start)[:2], tuple(e.dxf.end)[:2]))
            elif t == "CIRCLE":
                items.append(("circle", tuple(e.dxf.center)[:2], e.dxf.radius))
            elif t == "ARC":
                items.append(("arc", tuple(e.dxf.center)[:2], e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle))
            elif t == "LWPOLYLINE":
                pts = [tuple(xy) for xy in e.get_points('xy')]
                items.append(("poly", pts, e.closed))
            elif t == "SOLID":
                pts = [tuple(e.dxf.vtx0)[:2], tuple(e.dxf.vtx1)[:2], tuple(e.dxf.vtx2)[:2], tuple(e.dxf.vtx3)[:2]]
                items.append(("solid", pts))
            elif t == "INSERT":
                sub = doc.blocks.get(e.dxf.name)
                if sub is not None:
                    items += collect(sub, depth + 1)
        except Exception as ex:
            pass
    return items

def draw(blkname):
    blk = doc.blocks.get(blkname)
    if blk is None:
        print("no block", blkname); return
    items = collect(blk)
    fig, ax = plt.subplots(figsize=(3, 3), dpi=150)
    xs, ys = [], []
    for it in items:
        if it[0] == "line":
            (x1, y1), (x2, y2) = it[1], it[2]
            ax.plot([x1, x2], [y1, y2], 'k-', lw=1)
            xs += [x1, x2]; ys += [y1, y2]
        elif it[0] == "circle":
            (cx, cy), r = it[1], it[2]
            ax.add_patch(plt.Circle((cx, cy), r, fill=False, ec='k', lw=1))
            xs += [cx-r, cx+r]; ys += [cy-r, cy+r]
        elif it[0] == "arc":
            (cx, cy), r, a1, a2 = it[1], it[2], it[3], it[4]
            th = [math.radians(a1 + (a2-a1)*i/30) for i in range(31)]
            ax.plot([cx+r*math.cos(t) for t in th], [cy+r*math.sin(t) for t in th], 'k-', lw=1)
            xs += [cx-r, cx+r]; ys += [cy-r, cy+r]
        elif it[0] == "poly":
            pts, closed = it[1], it[2]
            if closed and pts:
                pts = pts + [pts[0]]
            ax.plot([q[0] for q in pts], [q[1] for q in pts], 'k-', lw=1)
            for q in pts:
                xs.append(q[0]); ys.append(q[1])
        elif it[0] == "solid":
            pts = it[1]
            ax.add_patch(plt.Polygon(pts, closed=True, fc='0.6', ec='k', lw=0.8))
            for q in pts:
                xs.append(q[0]); ys.append(q[1])
    if xs:
        pad = max((max(xs)-min(xs)), (max(ys)-min(ys))) * 0.1 + 1
        ax.set_xlim(min(xs)-pad, max(xs)+pad)
        ax.set_ylim(min(ys)-pad, max(ys)+pad)
    ax.set_aspect('equal'); ax.set_axis_off()
    fn = OUT + "\\blkdraw_" + blkname.replace("$", "S").replace("\\", "_").replace("/", "_") + ".png"
    fig.savefig(fn, bbox_inches='tight'); plt.close(fig)
    print("saved", fn, "items=", len(items))

for bn in ["$TwtSys$00000386", "$TwtSys$00000545", "$TwtSys$00000132",
           "$TwtSys$00000141", "A$C0CB13FA9", "A$C3ECF3B2E", "SSZZ"]:
    draw(bn)
