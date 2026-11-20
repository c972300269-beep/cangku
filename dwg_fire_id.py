import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter, defaultdict

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    s = s.replace('\\P', ' ').replace('\\n', ' ')
    return s.strip()

# 所有出现在 EQUIP_消火栓 / EQUIP_消防 图层上的 INSERT 块名
target_layers = {'EQUIP_消火栓', 'EQUIP_消防'}
layer_blocks = defaultdict(Counter)
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.layer in target_layers:
        layer_blocks[e.dxf.layer][e.dxf.name] += 1
print("=== EQUIP_消火栓 / EQUIP_消防 图层上的块 ===")
for ly in target_layers:
    print(f"\n图层 {ly}:")
    for k, v in layer_blocks[ly].most_common():
        print(f"   {k}: {v}")

# 候选块定义内部文字探查：看块内是否含 消火栓/箱/SG/消防
def block_texts(bname):
    blk = doc.blocks.get(bname)
    if blk is None:
        return [], 0
    ts = []
    ntypes = Counter()
    for e in blk:
        ntypes[e.dxftype()] += 1
        if e.dxftype() == "TEXT":
            ts.append(clean(e.dxf.text or ""))
        elif e.dxftype() == "MTEXT":
            ts.append(clean(e.text or ""))
    return ts, ntypes

# 取数量最多的匿名块 + 所有在消防图层出现的块，dump
candidates = set()
for ly in target_layers:
    candidates.update(layer_blocks[ly].keys())
# 外加数量大的 A$ 匿名块
inserts_all = Counter()
for e in msp:
    if e.dxftype() == "INSERT":
        inserts_all[e.dxf.name] += 1
for k, v in inserts_all.most_common(12):
    candidates.add(k)

print("\n=== 候选块定义内部文字（识别消防箱）===")
for bname in sorted(candidates):
    ts, ntypes = block_texts(bname)
    fire_mark = [t for t in ts if re.search(r'消|火|栓|箱|SG|消防|救|带|枪|水', t)]
    tag = " <<<消防特征" if fire_mark else ""
    print(f"\n块 {bname}  类型={dict(ntypes)}  内部文字数={len(ts)}{tag}")
    for t in ts[:10]:
        if t.strip():
            print(f"     · {t}")
    if fire_mark:
        for t in fire_mark:
            print(f"     ** {t}")
