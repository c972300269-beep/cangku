import os

roots = [
    r"D:\Documents\chenjialin3",
    r"C:\Users\chenjialin3\Desktop",
    r"C:\Users\chenjialin3\Documents",
]
# 去重已存在的
seen = set()
roots = [r for r in roots if os.path.isdir(r) and not seen.add(r)]

KW = ["万达", "香海", "一期"]
kw_hits = []
drawings = []
for root in roots:
    for dp, dn, fn in os.walk(root):
        # 跳过明显的缓存/云盘同步噪声过大目录可在此加，但先全扫
        for f in fn:
            try:
                if any(k in f for k in KW):
                    kw_hits.append(os.path.join(dp, f))
                if f.lower().endswith((".dwg", ".dxf", ".dwf")):
                    drawings.append(os.path.join(dp, f))
            except Exception:
                pass

print("=== 关键词(万达/香海/一期)命中文件 ===")
for x in kw_hits[:120]:
    print(x)
print("总计关键词命中:", len(kw_hits))
print()
print("=== 所有 CAD 图纸(dwg/dx/dwf) ===")
for x in drawings[:120]:
    print(x)
print("总计 CAD 图纸:", len(drawings))
