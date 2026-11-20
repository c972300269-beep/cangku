import msilib, os
msi = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\ODA.msi"
cabdir = r"E:\workbuddy\Claw\.workbuddy\tmp\dwg\oda"
db = msilib.OpenDatabase(msi, msilib.MSIDBOPEN_READONLY)

# File 表: File, Component_, FileName
files = {}
v = db.OpenView("SELECT File, Component_, FileName FROM File")
v.Execute(None)
while True:
    r = v.Fetch()
    if not r: break
    fk = r.GetString(1)
    fn = r.GetString(3)
    if "|" in fn:
        fn = fn.split("|")[1]
    files[fk] = fn

# Component 表: Component, ComponentId, Directory_
comp_dir = {}
v2 = db.OpenView("SELECT Component, Directory_ FROM Component")
v2.Execute(None)
while True:
    r = v2.Fetch()
    if not r: break
    comp_dir[r.GetString(1)] = r.GetString(2)

# Directory 表: Directory, Directory_Parent, DefaultDir
dirs = {}
v3 = db.OpenView("SELECT Directory, Directory_Parent, DefaultDir FROM Directory")
v3.Execute(None)
while True:
    r = v3.Fetch()
    if not r: break
    d = r.GetString(1)
    parent = r.GetString(2)
    default = r.GetString(3)
    if "|" in default:
        default = default.split("|")[1]
    dirs[d] = (parent, default)

# 计算完整相对路径
def full_path(key):
    parts = []
    while key and key in dirs:
        parent, default = dirs[key]
        parts.append(default)
        key = parent
    return os.path.join(*reversed(parts)) if parts else ""

# 重命名/移动
count = 0
for fk, fn in files.items():
    src = os.path.join(cabdir, fk)
    if not os.path.exists(src):
        continue
    rel = full_path(comp_dir.get(fk, ""))
    dst = os.path.join(cabdir, rel, fn) if rel else os.path.join(cabdir, fn)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.abspath(src) != os.path.abspath(dst):
        try:
            os.rename(src, dst)
            count += 1
        except Exception as e:
            print("rename fail", fk, fn, e)
print("重命名文件数:", count)
# 列出关键 exe/dll
for root, _, fnames in os.walk(cabdir):
    for f in fnames:
        if f.lower().endswith((".exe", ".dll")) and ("oda" in f.lower() or "converter" in f.lower() or "qt" in f.lower() or f.lower().startswith("q") or "platform" in root.lower()):
            print(os.path.relpath(os.path.join(root, f), cabdir))
