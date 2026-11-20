import ezdxf, re, os
p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
print("DXF版本:", doc.dxfversion)
msp = doc.modelspace()
# 图层
layers = doc.layers
all_layers = list(layers)
print("\n=== 图层总数:", len(all_layers))
kws = ['PIPE','VALVE','EQUIP','TWT','喷淋','消防','给水','排水','废水','市政','消火栓','给排水','WATER','DRAIN']
rel = [l.dxf.name for l in all_layers if any(k in l.dxf.name.upper() for k in kws)]
print("=== 给排水相关图层("+str(len(rel))+"):")
for n in rel:
    print("  ", n)
# 实体类型统计
from collections import Counter
types = Counter()
texts = []
inserts = Counter()
for e in msp:
    t = e.dxftype()
    types[t]+=1
    if t in ("TEXT","MTEXT"):
        if t=="TEXT":
            s = e.dxf.text
        else:
            s = e.text
        if s:
            texts.append(s)
    if t=="INSERT":
        inserts[e.dxf.name]+=1
print("\n=== 实体类型统计 ===")
for k,v in types.most_common():
    print(f"  {k}: {v}")
print("\n=== 图块(INSERT)引用 TOP ===")
for k,v in inserts.most_common(30):
    print(f"  {k}: {v}")
# 清洗文字: 去格式码
def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s)  # MTEXT 格式码
    s = re.sub(r'[{}]', '', s)
    s = s.replace('\\P',' ').replace('\\n',' ')
    return s.strip()
cleaned = [clean(s) for s in texts]
# 筛选"有意义"的文字: 含中文 或 管径(DN) 或 设备/泵/坑/阀/井/管 等
keywords = ['DN','泵','坑','阀','井','管','箱','池','消火栓','喷','集水','排水','给水','污水','废水','雨水','加压','水箱','流量计','水表','压力','标高','PL','WL','EL','X','Y']
def interesting(s):
    if re.search(r'[一-鿿]', s): return True
    if re.search(r'DN\d', s, re.I): return True
    if any(k in s for k in keywords): return True
    return False
good = sorted({s for s in cleaned if s and interesting(s) and len(s)<80})
print(f"\n=== 提取文字总数: {len(texts)}  有意义(去重): {len(good)} ===")
for s in good[:200]:
    print("  ", s)
