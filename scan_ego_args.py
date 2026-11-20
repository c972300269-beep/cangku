import re

p = r'E:\workbuddy\Claw\downloads\egoliteSetup-Y7MbxKIuhzFB.exe'
b = open(p, 'rb').read()


def collect(pattern, enc, filt, limit=60):
    ss = re.findall(pattern, b)
    out = []
    for s in ss:
        try:
            t = s.decode(enc)
        except Exception:
            continue
        if any(k in t.lower() for k in filt) and len(t) < 160 and t not in out:
            out.append(t)
    for t in out[:limit]:
        print(repr(t))


print('=== UTF16 switch candidates ===')
collect(rb'(?:[ -~]\x00){3,}', 'utf-16-le',
        ['--', 'silent', 'quiet', 'tag', 'appguid', 'install', 'dir=', 'handoff',
         'elevat', 'norestart', 'app=', 'brand', 'usage', 'switch'])

print('=== ASCII switch candidates ===')
collect(rb'[ -~]{4,}', 'latin1',
        ['--silent', '--system-level', '--cleanup', '--dir', '--tag', 'appguid',
         'installsource', 'usagestats', 'handoff', 'silent', '--app', 'metainstaller'])
