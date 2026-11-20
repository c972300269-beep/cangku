import olefile, os
msi = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\ODA.msi"
outdir = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\oda"
os.makedirs(outdir, exist_ok=True)
ole = olefile.OleFileIO(msi)
streams = ole.listdir()
print("流总数:", len(streams))
found = []
for s in streams:
    name = "/".join(s)
    try:
        data = ole.openstream(s).read()
    except Exception as e:
        continue
    sig = data[:4]
    tag = ""
    if sig == b"MSCF":
        tag = "CAB"
    if tag == "CAB" or len(data) > 500000:
        print(f"  流: {name!r}  大小={len(data)}  签名={sig}")
        if tag == "CAB":
            cpath = os.path.join(outdir, "extracted.cab")
            with open(cpath, "wb") as f:
                f.write(data)
            found.append(cpath)
            print("  -> 已保存为", cpath)
print("发现CAB:", found)
