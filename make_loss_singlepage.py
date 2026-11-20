# -*- coding: utf-8 -*-
"""生成单页版 损失清单.docx（A4，紧凑布局，确保一页）"""
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = r"E:\workbuddy\Claw\output\损失清单.docx"

def set_cjk(run, name):
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn('w:eastAsia'), name)
    run.font.name = name

doc = Document()

# 紧凑页边距
for sec in doc.sections:
    sec.top_margin = Cm(1.6)
    sec.bottom_margin = Cm(1.6)
    sec.left_margin = Cm(1.4)
    sec.right_margin = Cm(1.4)

# 标题
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("清远项目设备维修损失清单")
r.bold = True
r.font.size = Pt(15)
set_cjk(r, "SimHei")
p.paragraph_format.space_after = Pt(3)

# 副标题
ps = doc.add_paragraph()
ps.alignment = WD_ALIGN_PARAGRAPH.CENTER
rs = ps.add_run("统计周期：2026年9月　|　制表人：陈家林")
rs.font.size = Pt(9.5)
rs.font.color.rgb = RGBColor(0x44, 0x44, 0x44)
set_cjk(rs, "SimSun")
ps.paragraph_format.space_after = Pt(6)

headers = ["序号", "项目", "损失事项（设备/故障）", "供应商", "单据类型 / 编号", "金额（元）", "备注"]
data = [
    ["1", "香海二期", "水泵房高/中/低区控制柜自动转换故障维修（PLC控制系统·3套）", "清远蓝锐机电设备有限公司", "维修报价单", "10,893.46", "含税综合单价 3,631.15 元/套"],
    ["2", "龙湖苑", "2栋客梯维修变频器（默纳克一体机 22KW×1台）", "清远市安迅电梯工程有限公司", "电梯报价 QR/WB03_B2609158-2", "4,500.00", "含税，质保 6 个月"],
    ["3", "香海二期西区", "柴油发电机组维修（控制模块7210×1套 + 增压器检修×2台 + 工时费）", "惠州市鑫锐达动力设备有限公司", "维修报价单", "5,400.00", "含 1% 增值税专用发票"],
    ["4", "香海二期（飞来湖）", "欠压保护器 63A × 95 个", "广州建菲伽旭贸易有限公司", "送货单 XC2609200006", "6,460.00", "含税 13%（2026-09-20）"],
    ["5", "香海二期", "大华 DSS-H500S2 平台瘫故障数据恢复技术服务", "浙江大华科技有限公司", "现场服务单", "200.00", "2026-09-20 完成"],
]

table = doc.add_table(rows=1, cols=7)
table.style = "Table Grid"
table.alignment = WD_TABLE_ALIGNMENT.CENTER

# 表头
hdr = table.rows[0].cells
for i, h in enumerate(headers):
    run = hdr[i].paragraphs[0].add_run(h)
    run.bold = True
    run.font.size = Pt(9.5)
    set_cjk(run, "SimHei")
    hdr[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

# 数据行
for row in data:
    cells = table.add_row().cells
    for i, val in enumerate(row):
        run = cells[i].paragraphs[0].add_run(val)
        run.font.size = Pt(9)
        set_cjk(run, "SimSun")
        if i in (0, 1, 4):
            cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif i == 5:
            cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT

# 合计行（合并前5列）
trow = table.add_row().cells
merged = trow[0]
for j in range(1, 5):
    merged = merged.merge(trow[j])
mr = merged.paragraphs[0].add_run("合　计")
mr.bold = True
mr.font.size = Pt(9.5)
set_cjk(mr, "SimHei")
merged.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

ar = trow[5].paragraphs[0].add_run("27,453.46")
ar.bold = True
ar.font.size = Pt(9.5)
set_cjk(ar, "SimSun")
trow[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT

br = trow[6].paragraphs[0].add_run("—")
br.font.size = Pt(9.5)
set_cjk(br, "SimSun")
trow[6].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

# 表格单元格内边距（紧凑）
def set_cell_margins(tbl, top=24, bottom=24, left=48, right=48):
    tblPr = tbl._tbl.tblPr
    margins = OxmlElement('w:tblCellMar')
    for tag, val in (('top', top), ('bottom', bottom), ('start', left), ('end', right)):
        el = OxmlElement(f'w:{tag}')
        el.set(qn('w:w'), str(val))
        el.set(qn('w:type'), 'dxa')
        margins.append(el)
    tblPr.append(margins)

set_cell_margins(table, 24, 24, 48, 48)

# 落款（紧跟表格，不做分页）
psign = doc.add_paragraph()
psign.paragraph_format.space_before = Pt(6)
r = psign.add_run("制表人：陈家林　　日期：2026年9月21日")
r.font.size = Pt(9.5)
set_cjk(r, "SimSun")

doc.save(OUT)
print("saved:", OUT)
