import sys
sys.path.insert(0, r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/pylibs")
import ezdxf
p = r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
XHS="$TwtSys$00000545"
# 各块定义内直接含多少 XHS
print("=== 块定义内直接含消火栓块的 ===")
for blk in doc.blocks:
    c=sum(1 for e in blk if e.dxftype()=="INSERT" and e.dxf.name==XHS)
    if c: print(f"   {blk.name}: {c}")
# msp 顶层
top=sum(1 for e in msp if e.dxftype()=="INSERT" and e.dxf.name==XHS)
print("msp顶层:", top)
# 顶层插入的各个图纸块是不是含消火栓
print("\n=== msp 顶层插入块（名含平面图/图框/地下室） ===")
for e in msp:
    if e.dxftype()=="INSERT" and any(k in e.dxf.name for k in ["平面图","图框","地下室","参照"]):
        print("   ", e.dxf.name, "@", round(e.dxf.insert[0]), round(e.dxf.insert[1]))
