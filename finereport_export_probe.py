# 探测帆软决策平台报表导出 URL：找出能直接返回 xlsx 的接口组合
import json, urllib.request, urllib.error, urllib.parse

BASE = 'http://10.1.232.246:8089'
SESSION = r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json'
OUT = r'E:\workbuddy\Claw\reports\finereport'
d = json.load(open(SESSION, encoding='utf-8-sig'))
cookies = {c['name']: c['value'] for c in d['cookies']}
token = cookies.get('fine_auth_token', '')
cookie_hdr = '; '.join('%s=%s' % (k, v) for k, v in cookies.items())

# 先用一张小报表试
PATH = '钟瀚开发目录/家庭消费/家庭消费项目级汇总v2加参数.cpt'
ENTRY_ID = '7ae88e38-ffe9-4fd5-9fb4-47db6c3cf67c'
q = urllib.parse.quote(PATH, safe='/')

cases = [
    ('A decision/view/report xlsx', '/webroot/decision/view/report?viewlet=' + q + '&op=export&format=xlsx'),
    ('B decision/view/report excel', '/webroot/decision/view/report?viewlet=' + q + '&op=export&format=excel'),
    ('C view/report xlsx simple', '/webroot/decision/view/report?viewlet=' + q + '&op=export&format=xlsx&extype=simple'),
    ('D ReportServer excel', '/webroot/ReportServer?reportlet=' + q + '&op=export&format=excel'),
    ('E ReportServer xlsx', '/webroot/ReportServer?reportlet=' + q + '&op=export&format=xlsx'),
    ('F v10 entry/access xlsx', '/webroot/decision/v10/entry/access/' + ENTRY_ID + '?op=export&format=xlsx'),
    ('G view/report 预览', '/webroot/decision/view/report?viewlet=' + q),
    ('H v10 entry/access 预览', '/webroot/decision/v10/entry/access/' + ENTRY_ID),
]

def fetch(url):
    h = {'Cookie': cookie_hdr, 'Authorization': 'Bearer ' + token,
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
         'Accept': '*/*'}
    req = urllib.request.Request(BASE + url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

for name, url in cases:
    try:
        st, hd, body = fetch(url)
        ct = hd.get('Content-Type', '')
        cd = hd.get('Content-Disposition', '')
        magic = body[:8]
        kind = 'XLSX/ZIP' if magic[:2] == b'PK' else ('HTML' if magic[:1] == b'<' else ('JSON' if magic[:1] in (b'{', b'[') else repr(magic)))
        print('%-32s HTTP=%-3s len=%-8s kind=%-9s CT=%s' % (name, st, len(body), kind, ct[:45]))
        print('   CD =', cd[:120], '| head =', body[:150].decode('utf-8', 'replace').replace('\n', ' '))
        if kind == 'XLSX/ZIP':
            fn = OUT + r'\probe_export.xlsx'
            open(fn, 'wb').write(body)
            print('   >>> 命中！已保存', fn)
    except Exception as e:
        print('%-32s ERR %s' % (name, str(e)[:110]))
