import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf
from collections import Counter

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

# 统计含 消火/消防/栓 图层的 INSERT 实体
fire_layers = ['EQUIP_消火栓','EQUIP_消防','GS-地下室$0$EQUIP_消火栓','GS-地下室$0$EQUIP_消防',
               'GS-地下室$0$VPIPE-消防','PIPE-消防','PIPE-消防中','VPIPE-消防','VPIPE-消防中','PIPE-消防高',
               'VALVE_消防','TEXT_消防','EQUIP_气体灭火']
print("=== 各消防相关图层 INSERT 实体统计 ===")
total_by_layer = {}
for ly in fire_layers:
    cnt = Counter()
    n = 0
    for e in msp:
        if e.dxftype()=="INSERT" and e.dxf.layer==ly:
            n+=1; cnt[e.dxf.name]+=1
    total_by_layer[ly]=n
    print(f"\n{ly}: 共 {n} 个")
    for k,v in cnt.most_common():
        print(f"    {k}: {v}")

# 重点：GS-地下室$0$EQUIP_消火栓 的箱坐标范围 与 EQUIP_消火栓 是否重叠
def layer_xy(ly):
    xs,ys=[],[]
    for e in msp:
        if e.dxftype()=="INSERT" and e.dxf.layer==ly:
            try: ins=e.dxf.insert
            except Exception:
                try: ins=e.insert
                except Exception: ins=None
            if ins: xs.append(ins[0]); ys.append(ins[1])
    return xs,ys
for ly in ['EQUIP_消火栓','GS-地下室$0$EQUIP_消火栓']:
    xs,ys = layer_xy(ly)
    if xs:
        print(f"\n{ly} 坐标 X[{min(xs):.0f}~{max(xs):.0f}] Y[{min(ys):.0f}~{max(ys):.0f}]")
