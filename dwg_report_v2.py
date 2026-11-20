# -*- coding: utf-8 -*-
import ezdxf, math
DXF=".workbuddy/tmp/dwg/out/地下室给排水_t3.dxf"
doc=ezdxf.readfile(DXF); msp=doc.modelspace()
XHS="$TwtSys$00000545"; BOX="A$C3ECF3B2E"
single=[]; box=[]
for e in msp:
    if e.dxftype()!="INSERT": continue
    if e.dxf.name==XHS: single.append((e.dxf.insert[0],e.dxf.insert[1]))
    elif e.dxf.name==BOX: box.append((e.dxf.insert[0],e.dxf.insert[1]))
allx=[p[0] for p in single]+[p[0] for p in box]
xs=sorted(allx); gap=None
for i in range(1,len(xs)):
    if xs[i]-xs[i-1]>200000: gap=(xs[i-1],xs[i]); break
split=(gap[0]+gap[1])/2
L_s=[p for p in single if p[0]<split]; R_s=[p for p in single if p[0]>=split]
L_b=[p for p in box if p[0]<split]; R_b=[p for p in box if p[0]>=split]
L_box=len(L_s)+len(L_b); R_box=len(R_s)+len(R_b)
L_out=len(L_s)+2*len(L_b); R_out=len(R_s)+2*len(R_b)
T_box=L_box+R_box; T_out=L_out+R_out

pts=[]
for p in single: pts.append((p[0],p[1],"s",p[0]<split))
for p in box: pts.append((p[0],p[1],"d",p[0]<split))
xs_=[p[0] for p in pts]; ys=[p[1] for p in pts]
minx,maxx=min(xs_),max(xs_); miny,maxy=min(ys),max(ys)
W=1200;H=560
def tx(x): return 40+(x-minx)/(maxx-minx)*(W-80)
def ty(y): return H-40-(y-miny)/(maxy-miny)*(H-80)
svg=["<svg viewBox='0 0 1200 560' xmlns='http://www.w3.org/2000/svg' font-family='Microsoft YaHei,SimHei,sans-serif'>"]
svg.append("<rect x='0' y='0' width='1200' height='560' fill='#ffffff'/>")
svg.append("<line x1='%.1f' y1='20' x2='%.1f' y2='%d' stroke='#333' stroke-dasharray='6 4'/>"%(tx(split),tx(split),H-20))
svg.append("<text x='%.1f' y='30' font-size='13' fill='#333' text-anchor='end'>分界 X=%.0fk</text>"%(tx(split)-8,split/1000))
for x,y,kind,left in pts:
    c="#1c7ed6" if left else "#d6336c"
    if kind=="s":
        svg.append("<circle cx='%.1f' cy='%.1f' r='3.2' fill='%s'/>"%(tx(x),ty(y),c))
    else:
        svg.append("<rect x='%.1f' y='%.1f' width='8' height='8' fill='%s'/>"%(tx(x)-4,ty(y)-4,c))
svg.append("<text x='80' y='40' font-size='18' fill='#1c7ed6' font-weight='bold'>负一层 B1（大簇·左） %d 箱 / %d 栓口</text>"%(L_box,L_out))
svg.append("<text x='80' y='64' font-size='18' fill='#d6336c' font-weight='bold'>负二层 B2（小簇·右） %d 箱 / %d 栓口</text>"%(R_box,R_out))
svg.append("<text x='80' y='540' font-size='12' fill='#666'>● 单栓箱  ■ 双栓箱  （蓝=负一层 / 红=负二层）</text>")
svg.append("</svg>")
svg="".join(svg)

html="""
<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>地下室室内消火栓箱统计（按楼层）</title>
<style>
body{font-family:"Microsoft YaHei","SimHei",sans-serif;margin:24px;background:#fff;color:#222}
h1{font-size:22px}.card{border:1px solid #e3e8ef;border-radius:10px;padding:16px;margin:14px 0}
table{border-collapse:collapse;width:100%;font-size:15px}th,td{border:1px solid #d0d7de;padding:8px 12px;text-align:center}
th{background:#f1f5f9}.b1{color:#1c7ed6;font-weight:bold}.b2{color:#d6336c;font-weight:bold}
.note{background:#fff8e6;border-left:4px solid #f59f00;padding:10px 14px;font-size:14px;line-height:1.8}
code{background:#f1f5f9;padding:1px 5px;border-radius:4px}
</style></head><body>
<h1>地下室室内消火栓箱统计（按楼层）</h1>
<div class="card"><h3>Overview · 总览</h3>
<table><tr><th>楼层</th><th>箱数（箱体）</th><th>其中单栓箱</th><th>其中双栓箱</th><th>折合栓口数</th></tr>
<tr><td class="b1">负一层 B1（大簇·左）</td><td class="b1">@@L_BOX@@</td><td>@@L_S@@</td><td>@@L_B@@</td><td class="b1">@@L_OUT@@</td></tr>
<tr><td class="b2">负二层 B2（小簇·右）</td><td class="b2">@@R_BOX@@</td><td>@@R_S@@</td><td>@@R_B@@</td><td class="b2">@@R_OUT@@</td></tr>
<tr><td><b>合计</b></td><td><b>@@T_BOX@@</b></td><td>@@T_S@@</td><td>@@T_B@@</td><td><b>@@T_OUT@@</b></td></tr>
</table>
<p style="font-size:13px;color:#666">注：「箱」按箱体计数，一个双栓箱算 1 箱（含 2 个栓口）。若按「栓口/消火栓套数」报，则 B1=@@L_OUT@@、B2=@@R_OUT@@。</p>
</div>
<div class="card"><h3>Charts · 分布图</h3>@@SVG@@</div>
<div class="card"><h3>Logic · 判断依据</h3>
<ul style="line-height:1.9;font-size:14px">
<li><b>① 符号身份（与您发的图例一致）</b>：室内消火栓箱 = 块 <code>$TwtSys$00000545</code>（三角形外框 + 圆内打叉），双栓箱 = <code>A$C3ECF3B2E</code>（内含 2 个 545 + 矩形框），均在 <code>EQUIP_消防</code> 图层。图内另见「室内消火栓管」文字紧邻该符号（距离约 6k 单位），且您发的图例截图明确三角+叉=室内消火栓箱，身份确认。</li>
<li><b>② 数量合并去重</b>：单栓箱 491 + 双栓箱 188（每箱 2 栓口）→ <b>679 箱 / 867 栓口</b>，按 60 单位容差去重，零重叠。</li>
<li><b>③ 空间分簇（确定性）</b>：X 方向存在 <b>42.6 万单位</b>干净间隙（左簇最大 478.6k → 右簇最小 905.2k），分界 X≈692k，间隙 ±60k 内 <b>0 个</b>消火栓 → 两簇可信，无跨簇。</li>
<li><b>④ 楼层归属（三条互证）</b>：
  <br>· <u>管向词</u>：左簇「接至负二层15 / 接自地下二层5」= 管子向下续到 B2，是<b>负一层</b>平面写法；右簇「接上层19 / 接自负一层2 / 接至负一层5」= 管子向上接/来自 B1，是<b>负二层</b>平面写法 → 左=B1、右=B2。
  <br>· <u>图纸目录</u>：负一层 6 张（A1-1/2/3 + A2-1/2/3）、负二层 3 张（A2-4/5/6）；大簇若=B1 则单张≈80、B2≈67（均匀），反之则 B2≈159/B1≈34（极不均）→ 左=B1。
  <br>· <u>领域确认</u>：您确认「负1层面积更大」，大簇（左）对应 B1。
  <br>→ <b>大簇（左）= 负一层 B1，小簇（右）= 负二层 B2</b>。</li>
</ul>
<div class="note"><b>须如实说明的局限</b>：平面图簇内<b>没有直接的"本图为负一层"标签</b>——图纸目录（9 张图名）集中在图签索引区（Y≈−566k），未与两个平面簇空间对应；平面图内也未标负标高（−5.xx/−9.xx 仅在原理图区）。因此楼层判定依赖上述三条<b>间接但互证</b>的证据，把握度约 95%。若您能告知 B1/B2 的建筑标高，或指明哪个簇是负一层，即可 100% 锁定。</div>
</div></body></html>
"""
repl={"@@L_BOX@@":str(L_box),"@@L_S@@":str(len(L_s)),"@@L_B@@":str(len(L_b)),"@@L_OUT@@":str(L_out),
"@@R_BOX@@":str(R_box),"@@R_S@@":str(len(R_s)),"@@R_B@@":str(len(R_b)),"@@R_OUT@@":str(R_out),
"@@T_BOX@@":str(T_box),"@@T_S@@":str(len(L_s)+len(R_s)),"@@T_B@@":str(len(L_b)+len(R_b)),"@@T_OUT@@":str(T_out),
"@@SVG@@":svg}
for k,v in repl.items(): html=html.replace(k,v)
open(".workbuddy/tmp/dwg/reports/firebox_floors.html","w",encoding="utf-8").write(html)
print("OK 箱:",L_box,R_box,T_box," 栓口:",L_out,R_out,T_out)
