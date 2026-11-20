import re

p = r'E:\workbuddy\Claw\downloads\ego_extract\bin\bin\updater.exe'
b = open(p, 'rb').read()

# all --switch tokens, both ASCII and UTF-16
pat = rb'--[a-z][a-z0-9-]{2,40}'
asc = set(m.decode('latin1') for m in re.findall(pat, b))
u16 = set()
for m in re.findall(rb'(?:[ -~]\x00){3,}', b):
    try:
        t = m.decode('utf-16-le')
    except Exception:
        continue
    for s in re.findall(rb'--[a-z][a-z0-9-]{2,40}', t.encode('latin1')):
        u16.add(s.decode('latin1'))

print('ASCII_SWITCHES', len(asc))
for s in sorted(asc):
    print('  ', s)
print('UTF16_SWITCHES', len(u16))
for s in sorted(u16):
    print('  ', s)
