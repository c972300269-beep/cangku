# 拉取决策平台完整目录树，定位「邻里精选 / 家庭消费」系列报表节点及其 path/id
import json, urllib.request, urllib.error

BASE = 'http://10.1.232.246:8089'
SESSION = r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json'
OUT = r'E:\workbuddy\Claw\reports\finereport'
d = json.load(open(SESSION, encoding='utf-8-sig'))
cookies = {c['name']: c['value'] for c in d['cookies']}
token = cookies.get('fine_auth_token', '')
cookie_hdr = '; '.join('%s=%s' % (k, v) for k, v in cookies.items())

def call(path, extra=None):
    h = {'Cookie': cookie_hdr, 'Authorization': 'Bearer ' + token,
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
         'Accept': 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest'}
    if extra: h.update(extra)
    req = urllib.request.Request(BASE + path, headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode('utf-8', 'replace')

st, txt = call('/webroot/decision/v10/view/entry/tree')
print('目录树 HTTP =', st, '长度 =', len(txt))
open(OUT + r'\api_tree_full.json', 'w', encoding='utf-8').write(txt)
tree = json.loads(txt).get('data', [])
print('节点总数 =', len(tree))
print('顶层节点:')
for n in tree:
    if not n.get('pId'):
        print('  ', json.dumps(n, ensure_ascii=False)[:300])

byid = {n.get('id'): n for n in tree}

def ancestry(n):
    chain, cur, guard = [], n, 0
    while cur and guard < 20:
        chain.append(cur.get('text') or cur.get('id'))
        pid = cur.get('pId')
        cur = byid.get(pid) if pid else None
        guard += 1
    return ' / '.join(reversed(chain))

KEYS = ['家庭消费', '邻里精选', '目标填报', '房间明细', '项目级汇总', '层级报表', '收费数据']
print('\n===== 命中「家庭消费 / 邻里精选 / 目标填报」等关键词的节点 =====')
hits = []
for n in tree:
    s = json.dumps(n, ensure_ascii=False)
    if any(k in s for k in KEYS):
        hits.append(n)
        print('  id=%-45s pId=%-40s text=%-40s' % (str(n.get('id'))[:45], str(n.get('pId'))[:40], str(n.get('text'))[:40]))
        print('      path=%-70s type=%s' % (str(n.get('path'))[:70], n.get('type') or n.get('entryType') or n.get('nodeType')))
        print('      层级:', ancestry(n))
        print('      原始:', json.dumps(n, ensure_ascii=False)[:600])
print('\n命中节点数 =', len(hits))

# 打印所有含「报表」二字的目录（帮助理解结构）
print('\n===== 名称含「报表/数据/精选」的目录节点（前 80） =====')
c = 0
for n in tree:
    t = str(n.get('text') or '')
    if any(k in t for k in ['报表', '数据', '精选', '消费', '目标']):
        print('  %-55s id=%s pId=%s' % (t[:55], str(n.get('id'))[:40], str(n.get('pId'))[:40]))
        c += 1
        if c >= 80: break

open(OUT + r'\api_tree_hits.json', 'w', encoding='utf-8').write(json.dumps(hits, ensure_ascii=False, indent=2))
print('\n已保存 api_tree_full.json / api_tree_hits.json')
