import fitz, os, sys

src = r"C:\Users\chenjialin3\AppData\Local\Temp\workbuddy-weixin-media\inbound\weixin-file-41ee5040b19a2322-二次供水紫外线杀菌卫生许可批件.pdf"
out_dir = r"E:\workbuddy\Claw\.workbuddy\tmp\haiquan_pdf"
os.makedirs(out_dir, exist_ok=True)

doc = fitz.open(src)
print("页数:", doc.page_count)
all_text = []
for i, page in enumerate(doc):
    txt = page.get_text()
    all_text.append(txt)
    # 渲染
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    p = os.path.join(out_dir, f"p{i+1}.png")
    pix.save(p)
    print("saved", p)

full = "\n".join(all_text)
print("==== TEXT START ====")
print(full)
print("==== TEXT END ====")
# 关键字检索
for kw in ["海泉", "中山", "紫外", "卫生许可", "批件", "粤卫水", "有效期", "型号", "产品名称"]:
    idx = full.find(kw)
    if idx >= 0:
        seg = full[max(0,idx-40): idx+80].replace("\n"," ")
        print(f"[命中]{kw}: ...{seg}...")
    else:
        print(f"[未命中]{kw}")
