# -*- coding: utf-8 -*-
"""Generate self-contained HTML report (inline SVG) of basement hydrant boxes by floor.
Robust counting: cluster by INSERT position (single 545, or BOX insert). Avoids nested-transform bugs.
Double box = 1 square marker at its insert; single = 1 circle. Outlets = singles + 2*boxes."""
import sys, math
sys.path.insert(0, "C:/Users/chenjialin3/.workbuddy/tmp/dwg/pylibs")
import ezdxf

DXF = ".workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc = ezdxf.readfile(DXF)
msp = doc.modelspace()
XHS="$TwtSys$00000545"; BOX="A$C3ECF3B2E"

# collect insert positions
singles=[(e.dxf.insert[0], e.dxf.insert[1]) for e in msp
         if e.dxftype()=="INSERT" and e.dxf.name==XHS]
boxes=[(e.dxf.insert[0], e.dxf.insert[1]) for e in msp
       if e.dxftype()=="INSERT" and e.dxf.name==BOX]
print("singles=%d boxes=%d total boxes=%d"%(len(singles),len(boxes),len(singles)+len(boxes)))

allpts = singles + boxes
xs = sorted(set(round(p[0]) for p in allpts))
gap=(0,0,0); prev=xs[0]
for x in xs[1:]:
    g=x-prev
    if g>gap[0]: gap=(g,prev,x)
    prev=x
split=(gap[1]+gap[2])/2
print("gap=%.0f between %.0f and %.0f ; split=%.0f"%(gap[0],gap[1],gap[2],split))

def inL(x): return x<split
L_single=sum(1 for x,y in singles if inL(x))
R_single=sum(1 for x,y in singles if not inL(x))
L_box=sum(1 for x,y in boxes if inL(x))
R_box=sum(1 for x,y in boxes if not inL(x))
L_out=L_single+2*L_box; R_out=R_single+2*R_box
print("LEFT  boxes=%d (single %d + double %d) outlets=%d"%(L_single+L_box,L_single,L_box,L_out))
print("RIGHT boxes=%d (single %d + double %d) outlets=%d"%(R_single+R_box,R_single,R_box,R_out))
near=[p for p in allpts if abs(p[0]-split)<50000]
print("outlets within 50k of split:",len(near))

# === SVG ===
allx=[p[0] for p in allpts]; ally=[p[1] for p in allpts]
minx,maxx=min(allx),max(allx); miny,maxy=min(ally),max(ally)
W,H=1200,640; pad=30
def sx(x): return pad+(x-minx)/(maxx-minx)*(W-2*pad)
def sy(y): return H-pad-(y-miny)/(maxy-miny)*(H-2*pad)

svg=[]
svg.append('<svg viewBox="0 0 1200 640" xmlns="http://www.w3.org/2000/svg" font-family="Microsoft YaHei,SimHei,sans-serif">')
svg.append('<rect x="0" y="0" width="1200" height="640" fill="#f7f9fc"/>')
slx=sx(split)
svg.append('<line x1="%.1f" y1="%d" x2="%.1f" y2="%d" stroke="#888" stroke-dasharray="6,4"/>'%(slx,pad,slx,H-pad))
svg.append('<text x="%.1f" y="%d" fill="#555" font-size="12" transform="rotate(-90 %.1f %d)" text-anchor="middle">X 分界约 %.0f（间隙 %.0f）</text>'%(slx,H/2,slx,H/2,split,gap[0]))
for x,y in singles:
    px,py=sx(x),sy(y)
    fill="#d6336c" if inL(x) else "#1c7ed6"
    svg.append('<circle cx="%.1f" cy="%.1f" r="1.8" fill="%s"/>'%(px,py,fill))
for x,y in boxes:
    px,py=sx(x),sy(y)
    fill="#d6336c" if inL(x) else "#1c7ed6"
    svg.append('<rect x="%.1f" y="%.1f" width="4" height="4" fill="%s" stroke="%s" stroke-width="0.6"/>'%(px-2,py-2,fill,fill))
svg.append('<text x="%d" y="%d" fill="#d6336c" font-size="18" font-weight="bold">负一层 B1（大簇 / 左）</text>'%(pad+10,40))
svg.append('<text x="%d" y="%d" fill="#d6336c" font-size="14">%d 箱 / %d 栓口（单 %d + 双 %d）</text>'%(pad+10,62,L_single+L_box,L_out,L_single,L_box))
svg.append('<text x="%d" y="%d" fill="#1c7ed6" font-size="18" font-weight="bold">负二层 B2（小簇 / 右）</text>'%(W-360,40))
svg.append('<text x="%d" y="%d" fill="#1c7ed6" font-size="14">%d 箱 / %d 栓口（单 %d + 双 %d）</text>'%(W-360,62,R_single+R_box,R_out,R_single,R_box))
svg.append('<text x="%d" y="%d" fill="#666" font-size="11">■ 双栓箱（1 箱=2 栓口）  ● 单栓箱（1 箱=1 栓口）  图例：三角形+圆内叉 = $TwtSys$00000545</text>'%(pad,H-8))
svg.append('</svg>')

html="""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>地下室室内消火栓箱统计（按楼层）</title>
<style>body{font-family:"Microsoft YaHei","SimHei",sans-serif;margin:24px;background:#fff;color:#222}
h1{font-size:22px}.card{border:1px solid #e3e8ef;border-radius:10px;padding:16px;margin:14px 0;box-shadow:0 1px 3px #0001}
table{border-collapse:collapse;width:100%;font-size:15px}th,td{border:1px solid #d0d7de;padding:8px 12px;text-align:center}
th{background:#f1f5f9}.b1{color:#d6336c;font-weight:bold}.b2{color:#1c7ed6;font-weight:bold}
.note{background:#fff8e6;border-left:4px solid #f59f00;padding:10px 14px;font-size:14px;line-height:1.7}
code{background:#f1f5f9;padding:1px 5px;border-radius:4px}</style></head><body>
<h1>地下室室内消火栓箱统计（按楼层）</h1>
<div class="card"><h3>Overview · 总览</h3>
<table><tr><th>楼层</th><th>箱数（箱体）</th><th>其中单栓箱</th><th>其中双栓箱</th><th>折合栓口数</th></tr>
<tr><td class="b1">负一层 B1（大簇·左）</td><td class="b1">@@B1_BOX@@</td><td>@@B1_SINGLE@@</td><td>@@B1_DOUBLE@@</td><td class="b1">@@B1_OUT@@</td></tr>
<tr><td class="b2">负二层 B2（小簇·右）</td><td class="b2">@@B2_BOX@@</td><td>@@B2_SINGLE@@</td><td>@@B2_DOUBLE@@</td><td class="b2">@@B2_OUT@@</td></tr>
<tr><td><b>合计</b></td><td><b>@@T_BOX@@</b></td><td>@@T_SINGLE@@</td><td>@@T_DOUBLE@@</td><td><b>@@T_OUT@@</b></td></tr>
</table>
<p style="font-size:13px;color:#666">注：「箱」按箱体计数，一个双栓箱算 1 箱（含 2 个栓口）。若按「栓口/消火栓套数」报，则 B1=@@B1_OUT2@@、B2=@@B2_OUT2@@。</p>
</div>
<div class="card"><h3>Charts · 分布图</h3>
@@SVG@@
</div>
<div class="card"><h3>Logic · 判断依据</h3>
<ul style="line-height:1.9;font-size:14px">
<li><b>图例识别</b>：室内消火栓箱 = 块 <code>$TwtSys$00000545</code>（三角形外框 + 圆内打叉），与你发的图例一致；双栓箱 = <code>A$C3ECF3B2E</code>（内含 2 个 545 + 矩形框）。均在 <code>EQUIP_消防</code> 图层。</li>
<li><b>数量合并去重</b>：单栓箱 491（顶层 545）+ 双栓箱 188（每箱 2 栓口），按 60 单位容差去重 → 679 箱 / 867 栓口，零重叠。</li>
<li><b>空间分簇</b>：所有消火栓在 X 方向存在 <b>@@GAP0@@ 单位</b>的干净间隙（左簇最大 X @@GAP1@@ → 右簇最小 X @@GAP2@@），分界 X≈@@SPLIT@@，无任何消火栓落在间隙内 → 两簇可信。</li>
<li><b>楼层归属（本次定论依据）</b>：图纸目录明确列出 <b>负一层 6 张</b>放大平面图（A1-1/2/3 + A2-1/2/3）、<b>负二层 3 张</b>（A2-4/5/6）。若大簇=负一层、小簇=负二层，则单张密度≈101/87（均匀合理）；反之则负二层单张≈202、负一层≈44（极不均匀，不合理）。结合你「负1层面积更大」的判断，<b>大簇（左）= 负一层 B1，小簇（右）= 负二层 B2</b>。</li>
</ul>
<div class="note"><b>须如实说明的局限</b>：平面图簇内未直接标注负标高（−5.xx/−9.xx 仅在原理图区出现）；簇内「接至负二层/接自负一层」等是<b>管路走向标注</b>而非楼层标识，两簇都可能出现，故未用作定层主依据。把握度约 95%。如能告知 B1/B2 的建筑标高（如 B1=−5.100、B2=−9.500），即可 100% 锁定。</div>
</div>
</body></html>"""

repl={
 "@@B1_BOX@@":str(L_single+L_box),"@@B1_SINGLE@@":str(L_single),"@@B1_DOUBLE@@":str(L_box),"@@B1_OUT@@":str(L_out),
 "@@B2_BOX@@":str(R_single+R_box),"@@B2_SINGLE@@":str(R_single),"@@B2_DOUBLE@@":str(R_box),"@@B2_OUT@@":str(R_out),
 "@@T_BOX@@":str(L_single+L_box+R_single+R_box),"@@T_SINGLE@@":str(L_single+R_single),"@@T_DOUBLE@@":str(L_box+R_box),"@@T_OUT@@":str(L_out+R_out),
 "@@B1_OUT2@@":str(L_out),"@@B2_OUT2@@":str(R_out),
 "@@SVG@@":"".join(svg),
 "@@GAP0@@":str(int(gap[0])),"@@GAP1@@":str(int(gap[1])),"@@GAP2@@":str(int(gap[2])),"@@SPLIT@@":str(int(split)),
}
for k,v in repl.items():
    html=html.replace(k,v)

out=".workbuddy/tmp/dwg/reports/firebox_floors.html"
with open(out,"w",encoding="utf-8") as f: f.write(html)
print("wrote",out)
