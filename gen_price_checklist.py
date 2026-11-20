# -*- coding: utf-8 -*-
"""生成《电梯配件报价核对清单》docx（单页速查，供日常核价使用）"""
import os
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn

OUT = r'E:\workbuddy\Claw\reports\电梯配件报价核对清单_香海一期.docx'

doc = Document()
sec = doc.sections[0]
sec.page_width = Pt(595.3)
sec.page_height = Pt(841.9)
sec.left_margin = Pt(56.7)
sec.right_margin = Pt(56.7)
sec.top_margin = Pt(56.7)
sec.bottom_margin = Pt(56.7)

st = doc.styles['Normal']
st.font.name = '仿宋_GB2312'
st.font.size = Pt(10.5)
st._element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')


def set_run(run, name='仿宋_GB2312', size=10.5, bold=False):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run._element.rPr.rFonts.set(qn('w:eastAsia'), name)
    run._element.rPr.rFonts.set(qn('w:ascii'), 'Times New Roman')
    run._element.rPr.rFonts.set(qn('w:hAnsi'), 'Times New Roman')


def para(text='', size=10.5, bold=False, align=None, name='仿宋_GB2312', space_after=2):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = Pt(15)
    if align is not None:
        p.alignment = align
    if text:
        set_run(p.add_run(text), name, size, bold)
    return p


def make_table(headers, rows, widths=None, header_bold=True, font_size=9):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = t.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = ''
        p = hdr[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_run(p.add_run(h), '黑体', font_size, header_bold)
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ''
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i else WD_ALIGN_PARAGRAPH.LEFT
            set_run(p.add_run(str(v)), '仿宋_GB2312', font_size)
    return t


# ===== 标题 =====
para('电梯配件报价核对清单', size=16, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, name='黑体')
para('适用：时代香海彼岸一期 24台电梯维保  合同期 2026.7.1—2027.6.30  '
     '合同编号 XQHT-2026061400006', size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

# ===== 一、四步核价法 =====
para('一、每次收到报价单，先过这四关', size=11, bold=True, name='黑体')
make_table(
    ['#', '核对要点', '依据', '判定'],
    [
        ['1', '是"维修"还是"更换"？二者价差可达5—8倍',
         '9.10条：维修受4000/3000上限约束', '□合规 □超标'],
        ['2', '配件型号在附件八107项中有无对应报价？',
         '附件八（PDF第41—44页）', '□有 □无（须书面报价）'],
        ['3', '单件超5,000元：有无"无法维修"书面鉴定 + 甲方工程主任确认？',
         '补充协议3.3条', '□有 □无（退回）'],
        ['4', '钢丝绳工费是否按"超32层"档（Φ10/Φ12=4,800，Φ13=6,000）？',
         '本项目33—36层', '□是 □否'],
    ])

# ===== 二、高风险项 =====
para('')
para('二、高风险项（重点盯）', size=11, bold=True, name='黑体')
make_table(
    ['配件', '报价表价格', '正文上限', '风险'],
    [
        ['HGP INV 22KW 控制柜', '33,000', '4,000', '超8.25倍，香海一期匹配型号'],
        ['UAX变频 13503142', '27,000', '4,000', '超6.75倍'],
        ['HGP INV 15KW 控制柜', '19,000', '4,000', '超4.75倍'],
        ['LCA变频 C0088250', '17,500', '4,000', '超4.4倍'],
        ['LF变频 22KW', '13,000', '4,000', '超3.25倍'],
        ['MCA变频 N2000126', '10,000', '4,000', '超2.5倍'],
        ['主板（主控板）', '表中无此项', '3,000', '无价可依，须补报价'],
        ['门机板 DMC-1', '5,000', '—', '板类最高，核对必要性'],
    ])

# ===== 三、常用价格速查 =====
para('')
para('三、常用配件价格速查（含人工，附件八基准）', size=11, bold=True, name='黑体')
make_table(
    ['配件', '规格', '材料单价', '工费'],
    [
        ['钢丝绳Φ8', '麻芯/半钢芯/钢芯', '8.50 / 9.00 / 10.00 元/米', '1,000'],
        ['钢丝绳Φ10', '麻芯/半钢芯/钢芯', '12.00 / 13.00 / 14.00 元/米', '见档位'],
        ['钢丝绳Φ12', '麻芯/半钢芯/钢芯', '13.00 / 14.50 / 15.50 元/米', '见档位'],
        ['钢丝绳Φ13', '麻芯/半钢芯/钢芯', '15.00 / 16.00 / 17.00 元/米', '见档位'],
        ['钢丝绳工费档位', '低于15层 / 15—32层 / 超32层',
         'Φ10·Φ12：3,000 / 4,000 / 4,800', 'Φ13：3,000 / 5,000 / 6,000'],
        ['编码器', 'TS5246N2435 等6种型号', '—', '2,200（含人工）'],
        ['抱闸制动器', 'GHB-500', '—', '7,200（含人工）'],
        ['曳引轮', '400×5×10 ～ 600×6×12', '2,550 — 3,500', '1,500'],
        ['反绳轮', '400×5×10 ～ 400×6×12', '2,550 — 3,200', '1,500'],
        ['门电机', 'SF2-DSC-1000M / MPM59', '—', '3,400（含人工）'],
        ['门电机', 'MPM42-N2-174-H / YS7124', '—', '1,300 / 880'],
        ['光幕 / 二合一光幕', '牛津、爱琼思纯光幕', '—', '2,600 / 3,612'],
        ['补偿缆 / 补偿链', '4芯70mm / 88mm', '52 / 100', '3,200'],
        ['对重块（水泥）', '25 / 30-32 / 40 kg', '—', '250 / 300 / 360（含人工）'],
        ['对重块（钢板）', '25 / 30-32 / 40 kg', '—', '450 / 470 / 550（含人工）'],
        ['维修变频器', '11-15kw / 22kw / 30-37kw', '—', '3,000 / 3,500 / 4,000'],
        ['125%载荷试验', '1台 / 5台内 / 10台内 / 10台以上', '—', '1,200 / 1,000 / 900 / 800'],
        ['限速器校验', '—', '—', '350'],
        ['继电器板', 'RYBD / 12501749 / 12500925', '—', '1,450 / 1,700 / 2,000'],
    ])

# ===== 四、判定与签署 =====
para('')
para('四、核价结论', size=11, bold=True, name='黑体')
make_table(
    ['项目', '内容'],
    [
        ['报价单编号 / 日期', ''],
        ['涉及电梯（栋号-梯号）', ''],
        ['报价总金额', ''],
        ['核价结论', '□同意   □部分调整   □退回重报'],
        ['调整说明', ''],
        ['核对人 / 日期', ''],
        ['甲方工程主任确认', ''],
    ], font_size=9)

para('')
para('注：价格仅在维保合同期间内有效；每次更换前须取得甲方总部工程部电梯主任书面确认，'
     '否则甲方有权不予认可。', size=8)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.save(OUT)
print('SAVED:', OUT)
print('tables:', len(doc.tables))
