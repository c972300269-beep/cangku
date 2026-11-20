import sys
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

OUT = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg"

def render(layout, fname, pad=40):
    fig = plt.figure(figsize=(4, 4), dpi=150)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    ctx = RenderContext(doc)
    out = MatplotlibBackend(ax)
    try:
        Frontend(ctx, out).draw_layout(layout, finalize=True)
    except Exception as ex:
        print("draw err", fname, ex)
    # 自动范围
    try:
        xs, ys = [], []
        for e in layout:
            t = e.dxftype()
            if t == "CIRCLE":
                c = e.dxf.center; r = e.dxf.radius
                xs += [c[0]-r, c[0]+r]; ys += [c[1]-r, c[1]+r]
            elif t == "LINE":
                s, ee = e.dxf.start, e.dxf.end
                xs += [s[0], ee[0]]; ys += [s[1], ee[1]]
            elif t == "SOLID":
                for v in (e.dxf.vtx0, e.dxf.vtx1, e.dxf.vtx2, e.dxf.vtx3):
                    xs.append(v[0]); ys.append(v[1])
            elif t == "LWPOLYLINE":
                for x, y in e.get_points('xy'):
                    xs.append(x); ys.append(y)
            elif t in ("TEXT", "MTEXT", "ATTDEF"):
                try:
                    pt = e.dxf.insert
                    xs.append(pt[0]); ys.append(pt[1])
                except Exception:
                    pass
        if xs:
            ax.set_xlim(min(xs)-pad, max(xs)+pad)
            ax.set_ylim(min(ys)-pad, max(ys)+pad)
    except Exception as ex:
        print("range err", ex)
    fig.savefig(fname, dpi=150)
    plt.close(fig)
    print("saved", fname)

render(doc.blocks.get("$TwtSys$00000386"), OUT + r"\blk_386.png")
render(doc.blocks.get("$TwtSys$00000434"), OUT + r"\blk_434.png")
