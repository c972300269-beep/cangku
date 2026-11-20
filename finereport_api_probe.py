# 探测时代邻里数据分析平台后端 API 的认证方式（token 放 cookie 还是 Authorization 头）
# 用标准库 urllib，避免依赖 requests
import json, urllib.request, urllib.error, http.cookiejar

BASE = 'http://10.1.232.246:8089'
SESSION = r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json'
d = json.load(open(SESSION, encoding='utf-8-sig'))
cookies = {c['name']: c['value'] for c in d['cookies']}
token = cookies.get('fine_auth_token', '')
print('会话账号 =', d.get('user'), '| 抓取时间 =', d.get('fetchedAt'))
print('cookie 名 =', list(cookies), '| token 长度 =', len(token))
cookie_hdr = '; '.join('%s=%s' % (k, v) for k, v in cookies.items())

paths = [
    '/webroot/decision/v10/view/entry/tree',
    '/webroot/decision/v10/entry/tree',
    '/webroot/decision/login/info',
    '/webroot/decision/v10/favorite/entry/list',
]
header_variants = [
    ('无额外头', {}),
    ('Bearer token', {'Authorization': 'Bearer ' + token}),
    ('fine_auth_token 头', {'fine_auth_token': token}),
    ('token 头', {'token': token}),
    ('X-Auth-Token', {'X-Auth-Token': token}),
    ('Bearer + XMLHttpRequest', {'Authorization': 'Bearer ' + token, 'X-Requested-With': 'XMLHttpRequest'}),
]

def get(path, extra):
    h = {'Cookie': cookie_hdr, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'application/json, text/plain, */*'}
    h.update(extra)
    req = urllib.request.Request(BASE + path, headers=h)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.headers.get('Content-Type', ''), r.read()

for p in paths:
    print('\n===== ' + p + ' =====')
    for name, extra in header_variants:
        try:
            st, ct, body = get(p, extra)
            txt = body.decode('utf-8', 'replace')
            isjson = txt.lstrip().startswith(('{', '['))
            print('  %-24s HTTP=%-3s json=%-5s len=%-6s %s | %s' % (name, st, isjson, len(body), ct[:32], txt[:110].replace('\n', ' ')))
            if isjson:
                out = r'E:\workbuddy\Claw\reports\finereport\api_tree.json'
                open(out, 'w', encoding='utf-8').write(txt)
                print('  >>> 命中！已保存', out)
        except urllib.error.HTTPError as e:
            print('  %-24s HTTP=%-3s %s' % (name, e.code, e.read()[:80].decode('utf-8', 'replace').replace('\n', ' ')))
        except Exception as e:
            print('  %-24s ERR %s' % (name, str(e)[:90]))
