# 诊断：同一账号连续打开多张报表时，会话/JSESSIONID 是否轮换导致「无权限访问」
import json, re, http.cookiejar, urllib.request, urllib.error, time

BASE = 'http://10.1.232.246:8089'
S = r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json'
d = json.load(open(S, encoding='utf-8-sig'))
saved = {c['name']: c['value'] for c in d['cookies']}
token = saved.get('fine_auth_token', '')

cj = http.cookiejar.CookieJar()
for name, val in saved.items():
    cj.set_cookie(http.cookiejar.Cookie(0, name, val, None, False, '10.1.232.246', True, False,
                                        '/', True, False, None, True, None, None, {}, False))
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def get(url, timeout=60):
    h = {'Authorization': 'Bearer ' + token,
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36', 'Accept': '*/*'}
    req = urllib.request.Request(BASE + url, headers=h)
    try:
        with op.open(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode('utf-8', 'replace')

IDS = [
    ('2-2汇总', '7ae88e38-ffe9-4fd5-9fb4-47db6c3cf67c'),
    ('2 层级', '70daa864-b8c2-49e9-913c-024c4897a71d'),
    ('1-1房间明细', '9b8028a3-90d7-457a-8824-8d6484cd31d1'),
    ('3 目标填报', '49adbe80-de8d-4d9c-a2a6-c05345982e04'),
]
print('初始 JSESSIONID =', saved.get('JSESSIONID', '')[:16])
for label, eid in IDS:
    st, hd, html = get('/webroot/decision/v10/entry/access/' + eid)
    sid = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', html)
    errs = re.findall(r'Fine-Dec_[A-Za-z_]+', html)
    js = [c.value for c in cj if c.name == 'JSESSIONID']
    print('%-14s HTTP=%-3s len=%-7s sid=%-38s err=%-45s JSESSIONID=%s' % (
        label, st, len(html), sid.group(0) if sid else '(无)', ','.join(errs)[:44], (js[0][:16] if js else '(无)')))
    print('   Set-Cookie =', str(hd.get('Set-Cookie', ''))[:120])
    print('   片段 =', html[:150].replace('\n', ' '))
    time.sleep(1)
