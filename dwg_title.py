import sys, re, math
sys.path.insert(0, r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\pylibs")
import ezdxf

p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\out\地下室给排水_t3.dxf"
doc = ezdxf.readfile(p)
msp = doc.modelspace()

def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s or "")
    s = re.sub(r'[{}]', '', s)
    return s.replace('\\P', ' ').strip()

def dump_block_texts(name, depth=0, seen=None):
    if seen is None:
        seen = set()
    if name in seen or depth > 3:
        return
    seen.add(name)
    blk = doc.blocks.get(name)
    if blk is None:
        return
    for e in blk:
        t = e.dxftype()
        if t == "TEXT":
            s = clean(e.dxf.text)
            if s:
                print(f"      [{depth}] TEXT: {s}")
        elif t == "MTEXT":
            s = clean(e.text)
            if s:
                print(f"      [{depth}] MTEXT: {s}")
        elif t == "ATTDEF":
            print(f"      [{depth}] ATTDEF tag={e.dxf.tag} default={e.dxf.text!r} prompt={getattr(e.dxf,'prompt','')!r}")
        elif t == "INSERT":
            print(f"      [{depth}] -- nest: {e.dxf.name}")
            dump_block_texts(e.dxf.name, depth+1, seen)

for bn in ["A0飞来湖（北地块）给排水图框和签名 - 副本", "A1飞来湖（北地块）给排水图框和签名 - 副本", "A0图签"]:
    print("=" * 70)
    print("块:", bn)
    dump_block_texts(bn)

# 图框实例的属性
print("\n=== 图框实例 ATTRIB ===")
for e in msp:
    if e.dxftype() == "INSERT" and "图框" in e.dxf.name:
        atts = []
        if e.attribs:
            for a in e.attribs:
                atts.append(f"{a.dxf.tag}={a.dxf.text!r}")
        print(f"   @({e.dxf.insert[0]:.0f},{e.dxf.insert[1]:.0f}) rot={e.dxf.rotation:.0f} ATTRIB={atts}")

# 全图 ATTDEF 所在块
print("\n=== 全图所有 ATTDEF（在顶层块内统计） ===")
for bn in ["$TwtSys$00000386"]:
    b = doc.blocks.get(bn)
    for e in b:
        if e.dxftype() == "ATTDEF":
            print(f"   {bn}: tag={e.dxf.tag} default={e.dxf.text!r} layer={e.dxf.layer}")
