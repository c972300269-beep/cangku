import fitz, os

srcs = [
    r"F:\xwechat_files\c972300269_6716\temp\RWTemp\2026-09\ce23534c1a6bd106799139b0c007c0dd\清远时代香海二期水泵房高、中、低区控制柜自动转换故障维修报价单(3).pdf",
    r"F:\xwechat_files\c972300269_6716\temp\RWTemp\2026-09\ce23534c1a6bd106799139b0c007c0dd\龙湖苑2栋客梯电梯维修变频器 (2)(2).pdf",
    r"F:\xwechat_files\c972300269_6716\temp\RWTemp\2026-09\ce23534c1a6bd106799139b0c007c0dd\清远时代香海彼岸二期西区柴油发电机组维修报价(4).pdf",
]
out = r"E:\workbuddy\Claw\.workbuddy\tmp\quote_imgs"
os.makedirs(out, exist_ok=True)

for i, s in enumerate(srcs, 1):
    doc = fitz.open(s)
    txt = ""
    for pno, page in enumerate(doc):
        txt += "\n--- page %d ---\n" % (pno + 1) + page.get_text()
        pix = page.get_pixmap(dpi=150)
        pix.save(os.path.join(out, "doc%d_p%d.png" % (i, pno + 1)))
    with open(os.path.join(out, "doc%d.txt" % i), "w", encoding="utf-8") as f:
        f.write(txt)
    print("doc%d: %d page(s) -> %s" % (i, doc.page_count, os.path.basename(s)))
    doc.close()
print("DONE ->", out)
