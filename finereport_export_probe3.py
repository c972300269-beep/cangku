# 用预览页生成的 sessionID，试出帆软真实导出 URL（返回 xlsx 的组合）
import json, urllib.request, urllib.error, urllib.parse, re, os

BASE = 'http://10.1.232.246:8089'
OUT = r'E:\workbuddy\Claw\reports\finereport'
DL = r'E:\workbuddy\Claw\reports\家庭消费数据_平台导出_20261106'
os.makedirs(DL, exist_ok=True)
d = json.load(open(r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json', encoding='utf-8-sig'))
cookies = {c['name']: c['value'] for c in d['cookies']}
token = cookies.get('fine_auth_token', '')
cookie_hdr = '; '.join('%s=%s' % (k, v) for k, v in cookies.items())

def fetch(url):
    h = {'Cookie': cookie_hdr, 'Authorization': 'Bearer ' + token,
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36', 'Accept': '*/*'}
    req = urllib.request.Request(BASE + url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

ENTRY_ID = '7ae88e38-ffe9-4fd5-9fb4-47db6c3cf67c'   # 2-2 家庭消费项目级汇总表（最小，先试）

# 每次打开预览页都会生成新的报表会话
st, hd, body = fetch('/webroot/decision/v10/entry/access/' + ENTRY_ID)
html = body.decode('utf-8', 'replace')
sids = re.findall(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', html)
sid = sids[0] if sids else ''
print('预览页 HTTP =', st, 'len =', len(body), '| sessionID =', sid)
open(OUT + r'\probe_preview2.html', 'w', encoding='utf-8').write(html)
for kw in ['servletURL', 'url/report', 'ReportServer', 'view/report?op=export']:
    ms = list(re.finditer(re.escape(kw), html, re.I))[:3]
    print('  关键字', kw, '出现', len(list(re.finditer(re.escape(kw), html, re.I))), '次')
    for m in ms: print('     ', html[max(0, m.start() - 90):m.start() + 130].replace('\n', ' ')[:220])

if not sid:
    print('ERR 没拿到 sessionID'); raise SystemExit(1)

bases = ['/webroot/decision/view/report', '/webroot/decision/url/report', '/webroot/ReportServer']
extypes = ['simple', 'page', 'sheet']
formats = ['excel', 'xlsx']
found = []
for b in bases:
    for fmt in formats:
        for ext in extypes:
            url = b + '?op=export&sessionID=' + sid + '&format=' + fmt + '&extype=' + ext
            try:
                st2, hd2, b2 = fetch(url)
                magic = b2[:2]
                kind = 'XLSX' if magic == b'PK' else ('XLS' if magic == b'\xd0\xcf' else ('HTML' if b2[:1] == b'<' else repr(b2[:6])))
                cd = hd2.get('Content-Disposition', '')
                print('%-45s %-8s HTTP=%-3s len=%-9s kind=%-6s CD=%s' % (b.split('/')[-1] + ' fmt=' + fmt + ' ext=' + ext, '', st2, len(b2), kind, cd[:55]))
                if kind in ('XLSX', 'XLS'):
                    fn = DL + '\\probe_' + b.split('/')[-1] + '_' + fmt + '_' + ext + ('.xlsx' if kind == 'XLSX' else '.xls')
                    open(fn, 'wb').write(b2)
                    found.append((url, fn, len(b2)))
                    print('   >>> 命中！', fn)
            except Exception as e:
                print('%-45s ERR %s' % (b.split('/')[-1] + ' ' + fmt + ' ' + ext, str(e)[:70]))

print('\n可用组合数 =', len(found))
for u, f, n in found: print('  ', u[:130], '->', f, n, 'B')
open(OUT + r'\export_formula.json', 'w', encoding='utf-8').write(json.dumps(found, ensure_ascii=False, indent=2))
