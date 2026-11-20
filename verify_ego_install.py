import json
import os
import pathlib

APP = pathlib.Path(r'E:\workbuddy\Claw\_appdata\Citro Labs\ego lite\Application\0.6.2.7')
UD = pathlib.Path(r'E:\workbuddy\Claw\_appdata\Citro Labs\ego lite\User Data')
LNK = pathlib.Path(r'C:\Users\chenjialin3\.local\share\ego\active_version_dir')

print('=== APP top-level executables ===')
for f in sorted(APP.iterdir()):
    if f.is_file() and f.suffix.lower() in ('.exe', '.sig', '.manifest'):
        print(' ', f.name, f.stat().st_size)

print('=== manifest ===')
mf = APP / '0.6.2.7.manifest'
try:
    print(mf.read_text(encoding='utf-8')[:900])
except Exception as e:
    print('MANIFEST_ERR', e)

print('=== PATH link resolution ===')
print('LNK exists:', LNK.exists())
print('LNK is_symlink:', LNK.is_symlink())
try:
    print('LNK resolve:', os.path.realpath(str(LNK)))
except Exception as e:
    print('REALPATH_ERR', e)
try:
    print('LNK resolve_strict:', os.path.realpath(str(LNK), strict=True))
except Exception as e:
    print('STRICT_ERR', e)
exe_through = LNK / 'ego-browser.exe'
print('ego-browser.exe through link exists:', exe_through.exists())
if exe_through.exists():
    print('  size:', exe_through.stat().st_size)

print('=== Local State onboarding fields ===')
ls = UD / 'Local State'
try:
    d = json.loads(ls.read_text(encoding='utf-8'))
    ks = [k for k in d if any(x in k.lower() for x in ('onboard', 'first', 'import', 'welcome', 'setup', 'ego'))]
    print('KEYS:', ks[:30])
    for k in ks[:15]:
        print(' ', k, str(d[k])[:220])
except Exception as e:
    print('LOCAL_STATE_ERR', e)

print('=== User Data top-level ===')
try:
    for f in sorted(UD.iterdir())[:40]:
        print(' ', 'd' if f.is_dir() else 'f', f.name)
except Exception as e:
    print('UD_ERR', e)
