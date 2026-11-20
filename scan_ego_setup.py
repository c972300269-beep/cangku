import re

p = r'E:\workbuddy\Claw\downloads\egoliteSetup-Y7MbxKIuhzFB.exe'
b = open(p, 'rb').read()
ss = re.findall(rb'(?:[ -~]\x00){4,}', b)
keys = ['--dir', '--install', '--silent', '--tag', '--system', '--app', 'citro',
        'ego', 'localappdata', 'appdata', 'program files', 'setup', 'updater',
        'install', 'path', 'dir', 'help', 'usage', '--']
out = []
for s in ss:
    t = s.decode('utf-16-le')
    tl = t.lower()
    if any(k in tl for k in keys) and t not in out and len(t) < 200:
        out.append(t)
print('SETUP_UTF16_HITS', len(out))
for t in out[:120]:
    print(repr(t))
