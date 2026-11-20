import sys, re
sys.path.insert(0, r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/pylibs")
import ezdxf
p = r"E:/workbuddy/Claw/.workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(p); msp = doc.modelspace()
def clean(s):
    s = re.sub(r'\\([A-Za-z]+)[^;]*;', '', s or ""); s = re.sub(r'[{}]', '', s)
    return s.replace('\\P',' ').strip()
texts=[]
for e in msp:
    if e.dxftype()=="TEXT": texts.append((clean(e.dxf.text), e.dxf.insert[0], e.dxf.insert[1]))
    elif e.dxftype()=="MTEXT": texts.append((clean(e.text), e.dxf.insert[0], e.dxf.insert[1]))
def rep(x0,x1,y0,y1,name):
    ts=[s for (s,x,y) in texts if x0<=x<=x1 and y0<=y<=y1]
    print("###",name,"文字总数",len(ts))
    hit=[s for s in ts if "层" in s]
    print("  含'层'字:", len(hit))
    for s in sorted(set(hit)): print("     -",s)
    # 编号样
    num=[s for s in ts if re.fullmatch(r'[A-Za-z]{1,4}[-]?\d{1,3}', s or "")]
    print("  疑似编号:", sorted(set(num))[:40])
rep(60000,520000,-240000,160000,"左簇")
rep(930000,1200000,330000,620000,"右上簇")
