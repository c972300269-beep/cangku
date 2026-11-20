import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# 1) 图层
all_layers = [l.dxf.name for l in doc.layers]
print("=== 图层总数:", len(all_layers))
print("--- 全部图层名 ---")
for n in all_layers:
    print("   ", n)

# 2) INSERT 图块名（消防箱多半是块）
inserts = Counter()
for e in msp:
    if e.dxftype() == "INSERT":
        inserts[e.dxf.name] += 1
print("\n=== INSERT 图块 TOP 40 ===")
for k, v in inserts.most_common(40):
    print(f"   {k}: {v}")

# 3) 文字 clean
def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)
    s = re.sub(r'[{}]', '', s)
    s = s.replace('\\P', ' ').replace('\\n', ' ')
    return s.strip()

texts = []
for e in msp:
    t = e.dxftype()
    if t == "TEXT":
        texts.append(clean(e.dxf.text or ""))
    elif t == "MTEXT":
        texts.append(clean(e.text or ""))
texts = [t for t in texts if t]

# 4) 含消防/箱/消火栓的文字
fire_kw = ['消防', '消火', '火栓', '消火栓', '灭火', '喷淋', '箱', 'XHS', 'XH', 'FIRE', '栓']
print("\n=== 含消防/箱相关文字 ===")
seen = set()
for s in texts:
    if any(k in s for k in fire_kw):
        if s not in seen:
            seen.add(s)
            print("   ", s)

# 5) 楼层标识
floor_kw = ['负一', '负二', '负三', '地下一', '地下二', 'B1', 'B2', 'B3', 'B-1', '-1', '-2', '负 一', '负 二', '一层', '二层', 'F1', 'F2', '首层', '地下']
print("\n=== 含楼层标识文字 ===")
seen2 = set()
for s in texts:
    if any(k in s for k in floor_kw):
        if s not in seen2:
            seen2.add(s)
            print("   ", s)
print("\n文字总数:", len(texts))
