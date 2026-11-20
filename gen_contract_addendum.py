# -*- coding: utf-8 -*-
"""生成《电梯维保合同补充协议》草稿 docx（中文公文格式）"""
import os
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn

OUT = r'E:\workbuddy\Claw\reports\香海一期电梯维保合同补充协议（草稿）.docx'

doc = Document()

# 页面设置 A4，页边距
sec = doc.sections[0]
sec.page_width = Pt(595.3)   # 21cm
sec.page_height = Pt(841.9)  # 29.7cm
sec.left_margin = Pt(85.05)   # 3cm
sec.right_margin = Pt(85.05)
sec.top_margin = Pt(85.05)
sec.bottom_margin = Pt(85.05)

# 默认样式（正文：四号仿宋_GB2312，行距28磅）
style = doc.styles['Normal']
style.font.name = '仿宋_GB2312'
style.font.size = Pt(14)
style._element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')


def set_run(run, name='仿宋_GB2312', size=14, bold=False):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run._element.rPr.rFonts.set(qn('w:eastAsia'), name)
    run._element.rPr.rFonts.set(qn('w:ascii'), 'Times New Roman')
    run._element.rPr.rFonts.set(qn('w:hAnsi'), 'Times New Roman')


def para(text='', name='仿宋_GB2312', size=14, bold=False,
         align=None, indent=True, space_after=0, line=28):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.line_spacing = Pt(line)
    pf.space_after = Pt(space_after)
    if indent:
        pf.first_line_indent = Pt(size * 2)
    if align is not None:
        p.alignment = align
    if text:
        r = p.add_run(text)
        set_run(r, name, size, bold)
    return p


# ===== 标题 =====
para('电梯维保合同补充协议', name='黑体', size=18, bold=False,
     align=WD_ALIGN_PARAGRAPH.CENTER, indent=False, line=36, space_after=6)
para('（草稿）', name='楷体_GB2312', size=12,
     align=WD_ALIGN_PARAGRAPH.CENTER, indent=False, line=24, space_after=12)

# ===== 主体信息 =====
para('甲方：广州市时代邻里科技服务有限公司清远市分公司', indent=False)
para('乙方1：广州市时代港立电梯技术服务有限公司', indent=False)
para('乙方2：清远市安迅电梯工程有限公司', indent=False)
doc.add_paragraph()

para('鉴于三方于2026年签署《清远时代香海彼岸一期24台项目电梯维保合同》'
     '（合同编号：XQHT-2026061400006，合同期2026年7月1日至2027年6月30日，'
     '下称"原合同"），现就原合同履行过程中需进一步明确之事项，'
     '经三方友好协商，达成如下补充协议，以资共同遵守。')

# ===== 条款 =====
items = [
    ('第一条  合同总价笔误修正',
     '原合同第三条关于合同总价的表述中，小写金额"¥9,108.00"系笔误，'
     '现修正为"¥91,008.00"（大写：玖万壹仟零捌元整）。'
     '本合同项下一切价款结算均以¥91,008.00为准。'),

    ('第二条  应急响应到场时间统一',
     '原合同第9.8条"白天30分钟内到达现场"与第13.15条"白天20分钟内到达现场"'
     '表述不一致，现统一约定为：乙方2接到报修通知后，'
     '白天（08:00—20:00）20分钟内到达现场，夜间（20:00—次日08:00）30分钟内到达现场，'
     '电梯困人20分钟内到达现场。逾期未到场的，按原合同第13.15条约定以100元/次标准扣罚。'),

    ('第三条  "维修"与"更换"的界定及价格约束',
     None),

    ('3.1',
     '"维修单价"指对损坏部件进行修复、使其恢复原有功能所发生的费用；'
     '"更换"指以全新或翻新部件整体替换原损坏部件。二者适用不同的价格审批程序。'),

    ('3.2',
     '原合同第9.10条约定的上限价格（变频器4,000元/台、主板3,000元/块）适用于"维修"情形，'
     '乙方2维修单价不得超越该上限。'),

    ('3.3',
     '凡涉及"更换"变频器、控制柜、主板等单件单价超过5,000元的部件，'
     '乙方2须事先出具书面技术鉴定意见，说明该部件无法修复的原因，'
     '并经甲方总部工程部电梯主任及楼盘项目经理书面确认后方可实施。'),

    ('3.4',
     '更换全新配件的单价，不得超过原合同附件八《常用配件及维修报价表》'
     '所载对应型号价格；附件八未列明的型号，乙方2须事先书面报价并经甲方书面确认，'
     '否则甲方有权按附件八同类产品最低价结算，或对未经确认部分不予认可。'),

    ('3.5',
     '单台单次更换费用超过10,000元的，乙方2须同时提供不少于两家的比价资料，'
     '供甲方核价参考。'),

    ('第四条  补充"主板"报价项',
     '原合同第9.10条虽约定"主板上限价格3,000元/块"，但附件八《常用配件及维修报价表》'
     '未列明主板（主控板、微机板）各型号价格。乙方2应于本协议签订之日起5个工作日内，'
     '按其现行价格体系向甲方补充提交主板各型号书面报价清单，'
     '经甲方确认后作为原合同附件八之补充，与附件八具有同等效力。'
     '在该补充清单经甲方确认前，主板更换单价不得超过3,000元/块。'),

    ('第五条  钢丝绳更换工费档位确认',
     '三方确认本项目电梯为33—36层，属附件八备注所称"超32层"档位。'
     '钢丝绳更换工费按Φ10、Φ12规格为4,800元/台，Φ13规格为6,000元/台执行，'
     '不适用"低于15层"及"15—32层"档位价格。'),

    ('第六条  其他约定',
     '6.1  本协议与原合同约定不一致的，以本协议为准；本协议未尽事宜，按原合同执行。\n'
     '6.2  本协议自三方盖章并签字之日起生效，与原合同具有同等法律效力。\n'
     '6.3  本协议一式三份，甲方、乙方1、乙方2各执一份。'),
]

for title, body in items:
    if body is None:
        para(title, bold=True)
        continue
    if title.startswith('第') and '条' in title and body:
        para(title, bold=True)
        para(body)
    else:
        # 3.1 这类子条款：标题与正文同一段
        p = doc.add_paragraph()
        p.paragraph_format.line_spacing = Pt(28)
        p.paragraph_format.first_line_indent = Pt(28)
        r1 = p.add_run(title + '  ')
        set_run(r1, size=14, bold=True)
        r2 = p.add_run(body)
        set_run(r2, size=14)

# ===== 签署栏 =====
doc.add_paragraph()
para('（以下无正文）', indent=True)
doc.add_paragraph()
para('甲方（盖章）：广州市时代邻里科技服务有限公司清远市分公司', indent=False)
doc.add_paragraph()
para('代表签字：                    日期：      年    月    日', indent=False)
doc.add_paragraph()
para('乙方1（盖章）：广州市时代港立电梯技术服务有限公司', indent=False)
doc.add_paragraph()
para('代表签字：                    日期：      年    月    日', indent=False)
doc.add_paragraph()
para('乙方2（盖章）：清远市安迅电梯工程有限公司', indent=False)
doc.add_paragraph()
para('代表签字：                    日期：      年    月    日', indent=False)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.save(OUT)
print('SAVED:', OUT)
print('paragraphs:', len(doc.paragraphs))
