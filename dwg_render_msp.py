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

regions = [
    ("A_254cluster", 1367000, 1376000, -306000, -297000),
    ("B_78area",     470000,  490000, 108000, 118000),
]

for name, x0, x1, y0, y1 in regions:
    fig = plt.figure(figsize=(6, 6), dpi=130)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_axis_off()
    ctx = RenderContext(doc)
    out = MatplotlibBackend(ax)
    try:
        Frontend(ctx, out).draw_layout(msp, finalize=True)
    except Exception as ex:
        print("draw err", name, ex)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1)
    fn = OUT + "\\" + name + ".png"
    fig.savefig(fn, dpi=130); plt.close(fig)
    print("saved", fn)
