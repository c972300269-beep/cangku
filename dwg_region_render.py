import sys, math, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'SimSun']
plt.rcParams['axes.unicode_minus'] = False
import ezdxf

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()
OUT = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg"

def apply_one(pt, prm):
    (Ix, Iy), th, s, (bx, by) = prm
    x, y = pt[0]-bx, pt[1]-by
    c, si = math.cos(th), math.sin(th)
    xr = x*c - y*si
    yr = x*si + y*c
    return (Ix + xr*s, Iy + yr*s)

def to_world(pt, stack):
    for prm in reversed(stack):
        pt = apply_one(pt, prm)
    return pt

def inside(pt, R):
    return R[0] <= pt[0] <= R[1] and R[2] <= pt[1] <= R[3]

def draw(ents, stack, ax, R, depth=0):
    if depth > 4:
        return
    for e in ents:
        t = e.dxftype()
        try:
            if t == "INSERT":
                I = (e.dxf.insert[0], e.dxf.insert[1])
                # 变换插入点
                WI = to_world(I, stack)
                if not inside(WI, R):
                    continue
                th = math.radians(e.dxf.rotation)
                s = e.dxf.xscale if abs(e.dxf.xscale) > 1e-9 else 1.0
                sub = doc.blocks.get(e.dxf.name)
                if sub is None:
                    continue
                # 消火栓块用红点标记
                if e.dxf.name == "$TwtSys$00000545":
                    ax.plot([WI[0]], [WI[1]], 'r.', ms=3)
                draw(sub, stack + [(I, th, s, (0, 0))], ax, R, depth+1)
            elif t == "LINE":
                a = to_world((e.dxf.start[0], e.dxf.start[1]), stack)
                b = to_world((e.dxf.end[0], e.dxf.end[1]), stack)
                if inside(a, R) or inside(b, R):
                    ax.plot([a[0], b[0]], [a[1], b[1]], '-', color='0.55', lw=0.3)
            elif t == "LWPOLYLINE":
                pts = [to_world((x, y), stack) for x, y in e.get_points('xy')]
                if any(inside(q, R) for q in pts):
                    ax.plot([q[0] for q in pts], [q[1] for q in pts], '-', color='0.75', lw=0.3)
            elif t == "CIRCLE":
                c = to_world((e.dxf.center[0], e.dxf.center[1]), stack)
                if inside(c, R):
                    ax.add_patch(plt.Circle(c, e.dxf.radius*abs(stack[-1][2]) if stack else e.dxf.radius,
                                            fill=False, ec='0.5', lw=0.3))
            elif t == "ARC":
                c = to_world((e.dxf.center[0], e.dxf.center[1]), stack)
                if inside(c, R):
                    a1, a2 = e.dxf.start_angle, e.dxf.end_angle
                    th = [math.radians(a1 + (a2-a1)*i/24) for i in range(25)]
                    r = e.dxf.radius
                    ax.plot([c[0]+r*math.cos(t2) for t2 in th], [c[1]+r*math.sin(t2) for t2 in th], '-', color='0.5', lw=0.3)
            elif t in ("TEXT", "MTEXT"):
                s = e.dxf.text if t == "TEXT" else e.text
                s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s or "")
                s = re.sub(r'[{}]', '', s).replace('\\P', ' ').strip()
                if not s:
                    continue
                pt = to_world((e.dxf.insert[0], e.dxf.insert[1]), stack)
                if inside(pt, R):
                    ax.text(pt[0], pt[1], s, fontsize=3.2, color='darkgreen')
        except Exception:
            pass

def render(R, fname, title):
    fig, ax = plt.subplots(figsize=(14, 12), dpi=130)
    draw(msp, [], ax, R)
    ax.set_xlim(R[0], R[1]); ax.set_ylim(R[2], R[3])
    ax.set_aspect('equal'); ax.set_title(title)
    fig.savefig(fname, bbox_inches='tight'); plt.close(fig)
    print("saved", fname)

render((930000, 1200000, 330000, 620000), OUT + r"\region_right.png", "右上簇")
render((50000, 530000, -250000, 170000), OUT + r"\region_left.png", "左簇")
