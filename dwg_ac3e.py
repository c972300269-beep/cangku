import sys
sys.path.insert(0, r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/pylibs")
import ezdxf
p = r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
for bn in ["A$C3ECF3B2E","$TwtSys$00000545"]:
    print("="*60); print("块:", bn)
    blk=doc.blocks.get(bn)
    for e in blk:
        t=e.dxftype()
        if t=="INSERT":
            print(f"   INSERT {e.dxf.name} @({e.dxf.insert[0]:.1f},{e.dxf.insert[1]:.1f}) rot={e.dxf.rotation:.1f} s={e.dxf.xscale:.3f}")
        elif t=="CIRCLE":
            print(f"   CIRCLE c=({e.dxf.center[0]:.1f},{e.dxf.center[1]:.1f}) r={e.dxf.radius:.1f}")
        elif t=="LINE":
            print(f"   LINE ({e.dxf.start[0]:.1f},{e.dxf.start[1]:.1f})-({e.dxf.end[0]:.1f},{e.dxf.end[1]:.1f})")
        else:
            print("   ",t)
# A$C3ECF3B2E 实例位置
print("\n=== A$C3ECF3B2E 实例位置（前20） ===")
c=0
for e in msp:
    if e.dxftype()=="INSERT" and e.dxf.name=="A$C3ECF3B2E":
        print(f"   @({e.dxf.insert[0]:.0f},{e.dxf.insert[1]:.0f}) layer={e.dxf.layer}")
        c+=1
        if c>=20: break
print("总实例:", sum(1 for e in msp if e.dxftype()=="INSERT" and e.dxf.name=="A$C3ECF3B2E"))
