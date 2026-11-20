import zipfile, os

src_dir = r'E:/workbuddy/Claw/reports/dmi_tools'
doc = r'E:/workbuddy/Claw/reports/DMI工具使用教程.md'
out = r'E:/workbuddy/Claw/reports/DMI工具资料包.zip'

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src_dir):
        if '.git' in root:
            continue
        for f in files:
            p = os.path.join(root, f)
            arcname = os.path.relpath(p, os.path.dirname(src_dir))
            z.write(p, arcname)
            print('added', arcname)
    if os.path.exists(doc):
        z.write(doc, os.path.basename(doc))
        print('added', os.path.basename(doc))

print('DONE size=', os.path.getsize(out))
print('OUT=', out)
