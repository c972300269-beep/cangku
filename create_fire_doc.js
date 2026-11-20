import subprocess, json, os

BASE = r"C:\Users\chenjialin3\AppData\Local\Programs\WorkBuddy\resources\app.asar.unpacked\resources\builtin-skills\tencent-local-office-edit"
PYTHON = r"C:\Users\chenjialin3\.workbuddy\binaries\python\versions\3.13.12\python.exe"

def call(tool, **kwargs):
    args = [PYTHON, "edsdk.py", "call", tool]
    for k, v in kwargs.items():
        if isinstance(v, (dict, list)):
            args.extend(["--json", json.dumps(v, ensure_ascii=False)])
        else:
            args.append(f"{k}={v}")
    r = subprocess.run(args, cwd=BASE, capture_output=True, text=True, timeout=30)
    out = r.stdout.strip()
    try: return json.loads(out)
    except: return out

# Step 1: Create doc
print("Creating doc...")
res = call("create_doc")
if isinstance(res, dict) and "file_id" in res:
    fid = res["file_id"]
    print(f"file_id: {fid}")
else:
    print("Create failed:", res)
    exit(1)

# Step 2: Insert all content
content = """社会单位消防安全自查评估报告
（单位自查评估，非第三方机构）

单位名称：________________________
统一社会信用代码：________________
单位详细地址：____________________
消防安全责任人：__________    联系电话：____________
消防安全管理人：__________    联系电话：____________
评估方式：☑单位自行自查评估    □聘请第三方机构评估
评估日期：_______年____月____日

一、评估依据
依据《中华人民共和国消防法》《消防安全责任制实施办法》、XF/T3005-2020《单位消防安全评估》、《建筑设计防火规范》等法律法规及技术标准，组织开展本次消防安全自查评估工作。

二、单位基本概况
建筑使用性质：________________
建筑层数：____层，总建筑面积：________㎡
在岗人员数量：____人
消防设施配置：
□火灾自动报警系统    □自动喷水灭火系统    □室内消火栓系统
□应急照明和疏散指示标志    □灭火器    □防排烟系统    □消防控制室
消防手续办理情况：
□消防设计审核/备案    □消防验收/备案    □公众聚集场所投入使用、营业前消防安全检查

三、自查评估情况
（一）消防安全管理
1、已明确消防安全责任人和消防安全管理人，逐级落实消防安全岗位职责。
2、建立防火巡查、防火检查制度，按规定频次开展检查，留存检查记录。
3、编制灭火和应急疏散预案；□已组织开展消防应急演练，演练时间：________。
4、定期组织员工消防安全教育培训，落实新入职人员岗前消防培训。
5、消防控制室：□本单位无消防控制室；□设有消防控制室，落实24小时值班制度，值班人员持证上岗。

（二）建筑防火管理
1、防火分区、防火分隔、防火门、防火卷帘等设施完好有效。
2、疏散通道、安全出口、消防车通道保持畅通，无占用、堵塞、锁闭现象。
3、建筑内部装修、外墙保温材料符合防火相关规范，未违规使用易燃可燃材料。
4、用火、用电、用气、动火作业安全管理制度落实到位。

（三）消防设施器材状态
1、灭火器、室内消火栓配置数量齐全，压力正常，完好可用。
2、火灾自动报警、自动喷水、防排烟等自动消防设施定期维护，运行状态正常。
3、应急照明、疏散指示标志完好，断电后可正常工作。

四、自查发现火灾隐患
（没有隐患填写：本次自查未发现重大火灾隐患，存在部分一般问题如下）
1、________________________________________________________
2、________________________________________________________
重大火灾隐患：□无    □有（如存在重大隐患，请另行附页专项说明）

五、隐患整改措施及完成时限
1、隐患问题：________________________________________
整改措施：________________________________________
计划完成时间：____________

2、隐患问题：________________________________________
整改措施：________________________________________
计划完成时间：____________

六、综合评估结论
经本单位自查评估，火灾风险等级：□低风险    □一般风险    □较高风险    □高风险。
综合消防安全状况：

承诺：本单位对本次自查评估报告全部内容的真实性承担全部责任。

自查评估人签字：______________
单位（加盖公章）：________________
_______年____月____日

Word操作要点：
粘贴进Word后，横线、方框可以直接编辑填写；
填完可以保存docx，也可以另存PDF，通过微信（微信号：QXXFJYDD）线上报送；
纸质版打印后必须盖单位公章，线下递交消防救援局。"""

print("Inserting content...")
# Split into chunks to avoid issues
lines = content.split('\n')
chunks = []
chunk = ""
for line in lines:
    if len(chunk) + len(line) + 1 > 3000:
        chunks.append(chunk)
        chunk = line
    else:
        chunk = chunk + "\n" + line if chunk else line
if chunk:
    chunks.append(chunk)

idx = 0
for i, c in enumerate(chunks):
    text = c + "\n" if i < len(chunks) - 1 else c
    r = call("doc_insert_text", file_id=fid, idx=idx, text=text)
    if isinstance(r, dict) and "last_edit_index" in r:
        idx = r["last_edit_index"]
    else:
        print(f"  Chunk {i} failed:", r)
        break
    print(f"  Chunk {i+1}/{len(chunks)} OK, idx={idx}")

# Step 3: Save
output_path = r"E:\workbuddy\Claw\reports\消防安全自查评估报告_模板.docx"
print(f"\nSaving to {output_path}...")
r = call("save_file", file_id=fid, file_path=output_path)
print("Save result:", r)
