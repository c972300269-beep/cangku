import sys
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import ezdxf

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()
OUT = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg"

xhs = []
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == "$TwtSys$00000545":
        xhs.append((e.dxf.insert[0], e.dxf.insert[1]))

frames = []
for e in msp:
    if e.dxftype() == "INSERT" and "图框" in e.dxf.name:
        frames.append((e.dxf.insert[0], e.dxf.insert[1], e.dxf.name[:2], e.dxf.rotation))

fig, ax = plt.subplots(figsize=(11, 9), dpi=110)
ax.scatter([q[0] for q in xhs], [q[1] for q in xhs], s=6, c='red', alpha=0.6, label=f'XHS n={len(xhs)}')
ax.scatter([f[0] for f in frames], [f[1] for f in frames], s=120, marker='s', c='blue', alpha=0.5, label='frames')
for (x, y, nm, rot) in frames:
    ax.annotate(f"{nm} {rot:.0f}", (x, y), fontsize=7, color='blue')
# 图名/楼层文字位置
floors = [
    ("负一层A1-1消", 1075212, -566671), ("负二层A2-4消", 1077248, -570345),
    ("接自负一层环管", 1033033, 436057), ("接至负二层环管", 225681, -11727),
    ("本图适用负一层电梯排水", 1682274, -103176), ("本图适用负二层电梯排水", 1695842, -99217),
]
for (s, x, y) in floors:
    ax.scatter([x], [y], s=40, marker='^', c='green', alpha=0.8)
    ax.annotate(s, (x, y), fontsize=7, color='green')
ax.set_aspect('equal'); ax.legend(); ax.grid(True, ls=':', alpha=0.4)
ax.set_title("XHS (消火栓) distribution vs frames")
fig.savefig(OUT + r"\xhs_scatter.png", bbox_inches='tight')
print("saved", OUT + r"\xhs_scatter.png", "n=", len(xhs))
