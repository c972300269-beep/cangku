import sys, re
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

for bn in ["$TwtSys$00000386", "$TwtSys$00000434"]:
    blk = doc.blocks.get(bn)
    print("=" * 60)
    print("块名:", bn)
    for ent in blk:
        t = ent.dxftype()
        if t == "SOLID":
            try:
                pts = [ent.dxf.vtx0, ent.dxf.vtx1, ent.dxf.vtx2, ent.dxf.vtx3]
                print(f"   SOLID pts={[(round(p[0],1), round(p[1],1)) for p in pts]}")
            except Exception as ex:
                print("   SOLID err", ex)
        elif t == "ATTDEF":
            print(f"   ATTDEF tag={ent.dxf.tag} prompt={getattr(ent.dxf,'prompt','')} default={ent.dxf.text} layer={ent.dxf.layer}")

# 打印实例的属性值（前10个 $TwtSys$00000386 实例）
print("\n=== $TwtSys$00000386 实例的属性(前12) ===")
cnt = 0
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == "$TwtSys$00000386":
        attribs = []
        if e.attribs:
            for a in e.attribs:
                attribs.append(f"{a.dxf.tag}={a.dxf.text}")
        print(f"   @({e.dxf.insert[0]:.0f},{e.dxf.insert[1]:.0f}) layer={e.dxf.layer} ATTRIB={attribs}")
        cnt += 1
        if cnt >= 12:
            break

print("\n=== $TwtSys$00000434 实例的属性(前12) ===")
cnt = 0
for e in msp:
    if e.dxftype() == "INSERT" and e.dxf.name == "$TwtSys$00000434":
        attribs = []
        if e.attribs:
            for a in e.attribs:
                attribs.append(f"{a.dxf.tag}={a.dxf.text}")
        print(f"   @({e.dxf.insert[0]:.0f},{e.dxf.insert[1]:.0f}) layer={e.dxf.layer} ATTRIB={attribs}")
        cnt += 1
        if cnt >= 12:
            break
