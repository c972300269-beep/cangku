import re

p = r'E:\workbuddy\Claw\downloads\ego_extract\bin\bin\updater.exe'
b = open(p, 'rb').read()
ss = re.findall(rb'(?:[ -~]\x00){4,}', b)
keys = ['citro', 'ego', 'localappdata', 'appdata', 'programdata', 'installdir',
        '--dir', 'setup.exe', 'update2', 'lite.ego', 'ego-browser', 'skills',
        '\\Users\\', '%LOCAL', 'EgoUpdater', 'Application Support']
out = []
for s in ss:
    t = s.decode('utf-16-le')
    if any(k.lower() in t.lower() for k in keys) and t not in out:
        out.append(t)
print('UTF16_HITS', len(out))
for t in out[:80]:
    print(repr(t[:190]))

print('--- ASCII argv-ish ---')
a = re.findall(rb'[ -~]{4,}', b)
keys2 = [b'--dir', b'--install', b'--silent', b'--app-guid', b'--tag', b'--system',
         b'Citro Labs', b'EgoUpdater', b'ego-browser', b'--handoff', b'--uninstall']
for k in keys2:
    hits = [s.decode('latin1') for s in a if k in s]
    u = []
    for h in hits:
        if len(h) > 220:
            h = h[:220] + '...'
        if h not in u:
            u.append(h)
    if u:
        print('###', k.decode('latin1'), len(u))
        for h in u[:8]:
            print('   ', h)
