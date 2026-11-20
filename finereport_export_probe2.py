# 保存报表预览页与错误页，分析真实导出接口 / sessionID / 参数
import json, urllib.request, urllib.error, urllib.parse, re

BASE = 'http://10.1.232.246:8089'
OUT = r'E:\workbuddy\Claw\reports\finereport'
d = json.load(open(r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json', encoding='utf-8-sig'))
cookies = {c['name']: c['value'] for c in d['cookies']}
token = cookies.get('fine_auth_token', '')
cookie_hdr = '; '.join('%s=%s' % (k, v) for k, v in cookies.items())

def fetch(url):
    h = {'Cookie': cookie_hdr, 'Authorization': 'Bearer ' + token,
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36', 'Accept': '*/*'}
    req = urllib.request.Request(BASE + url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

PATH = '钟瀚开发目录/家庭消费/家庭消费项目级汇总v2加参数.cpt'
q = urllib.parse.quote(PATH, safe='/')
ENTRY_ID = '7ae88e38-ffe9-4fd5-9fb4-47db6c3cf67c'

for name, url in [
    ('err', '/webroot/decision/view/report?viewlet=' + q + '&op=export&format=xlsx'),
    ('preview', '/webroot/decision/v10/entry/access/' + ENTRY_ID),
]:
    st, hd, body = fetch(url)
    fn = OUT + '\\probe_' + name + '.html'
    open(fn, 'wb').write(body)
    txt = body.decode('utf-8', 'replace')
    print('\n===== ' + name + ' HTTP=' + str(st) + ' len=' + str(len(body)) + ' -> ' + fn + ' =====')
    print('CD =', hd.get('Content-Disposition', ''))
    # 错误页正文
    if name == 'err':
        print('正文:', re.sub(r'<[^>]+>', ' ', txt)[:1200])
    else:
        # 找导出 / sessionID / export / op= 相关线索
        for kw in ['export', 'sessionID', 'sessionId', 'reportlet', 'viewlet', 'op=', 'download', '导出', 'excel', 'xlsx', 'format']:
            hits = [m.start() for m in re.finditer(re.escape(kw), txt, re.I)][:6]
            if hits:
                print('\n-- 关键字 %s (%d 处) --' % (kw, len(hits)))
                for p in hits[:4]:
                    print('   ', txt[max(0, p - 130):p + 180].replace('\n', ' ')[:310])
