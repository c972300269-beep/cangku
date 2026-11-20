import re, sys
p = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\地下室给排水_t3.dwg"
data = open(p, "rb").read()
print("文件大小:", len(data))
# 提取连续可打印 ASCII/常见中文(GBK/UTF8)序列
# 先尝试 UTF-8 解码整段，找可打印子串
# 简单: 扫描字节，收集 (ascii printable) 序列 >=4
ascii_re = re.compile(rb'[\x20-\x7e]{5,}')
found = ascii_re.findall(data)
seen = {}
out = []
for b in found:
    s = b.decode("ascii", "ignore")
    # 过滤明显噪声
    if re.search(r'(https?://|AcDb|AcDbEntity|@|\\U\+|viewport|VIEWPORT|AutoCAD|\\n|\\p)', s):
        continue
    if s in seen:
        seen[s]+=1
    else:
        seen[s]=1
        out.append(s)
# 排序: 出现次数多的优先
rank = sorted(seen.items(), key=lambda x:-x[1])
print("ASCII可读串总数(去重后):", len(out))
print("=== 出现次数>=2 或 长度>=8 的样例(前120) ===")
cnt=0
for s,c in rank:
    if c>=2 or len(s)>=8:
        print(f"[{c}] {s}")
        cnt+=1
    if cnt>=120:
        break
