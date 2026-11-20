import os

roots = [r"D:\Documents\chenjialin3", r"C:\Users\chenjialin3\Desktop", r"C:\Users\chenjialin3\Documents"]
seen = set()
roots = [r for r in roots if os.path.isdir(r) and not seen.add(r)]

KW = ["万达西", "香海一期", "香海彼岸一期"]
IMG_EXT = {".dwg", ".dxf", ".dwf", ".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}
PLAN_KW = ["图", "平面", "规划", "布置", "系统", "管线", "户型", "总平", "大样", "施工"]

allkw = []
for root in roots:
    for dp, _, fn in os.walk(root):
        for f in fn:
            try:
                ext = os.path.splitext(f)[1].lower()
                if any(k in f for k in KW):
                    allkw.append((f, os.path.join(dp, f), ext))
            except Exception:
                pass

drawings = [(f, p) for f, p, ext in allkw if ext in IMG_EXT and any(pk in f for pk in PLAN_KW)]

print("=== 【图纸类】香海一期/万达西 相关 (dwg/pdf/图片且文件名含 图/平面/规划/管线 等) ===")
for f, p in drawings:
    print(p)
print("图纸类共:", len(drawings))
print()
print("=== 【全部】香海一期/万达西 关键词命中文件(按类型) ===")
for f, p, ext in allkw:
    print(f"[{ext}] {p}")
print("全部命中共:", len(allkw))
