# 用已登录会话（Bearer token）直接从平台重新导出 4 张家庭消费报表
# 流程：GET /v10/entry/access/<报表id> 生成报表会话 -> GET /view/report?op=export&sessionID=...&format=excel&extype=simple
# 不依赖浏览器渲染，规避前端资源中断；逐张独立请求 + 失败重试，产出全部写 E 盘
import json, os, re, sys, time, urllib.request, urllib.error, zipfile, datetime

BASE = 'http://10.1.232.246:8089'
SESSION = r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json'
DL = r'E:\workbuddy\Claw\reports\家庭消费数据_平台导出_20261106'
OUT = r'E:\workbuddy\Claw\reports\finereport'
os.makedirs(DL, exist_ok=True)

d = json.load(open(SESSION, encoding='utf-8-sig'))
cookies = {c['name']: c['value'] for c in d['cookies']}
token = cookies.get('fine_auth_token', '')
cookie_hdr = '; '.join('%s=%s' % (k, v) for k, v in cookies.items())
HDRS = {'Cookie': cookie_hdr, 'Authorization': 'Bearer ' + token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
        'Accept': '*/*'}

REPORTS = [
    ('2-2_家庭消费项目级汇总表.xlsx', '7ae88e38-ffe9-4fd5-9fb4-47db6c3cf67c', '2-2 家庭消费项目级汇总表'),
    ('1-05邻里精选_02-家庭消费数据报表_2_家庭消费数据层级报表（楼栋→项目→公司→集团）.xlsx', '70daa864-b8c2-49e9-913c-024c4897a71d', '2 家庭消费数据层级报表'),
    ('1-1_家庭消费房间明细表_住宅.xlsx', '9b8028a3-90d7-457a-8824-8d6484cd31d1', '1-1 家庭消费房间明细表_住宅'),
    ('3_项目&区域目标填报表.xlsx', '49adbe80-de8d-4d9c-a2a6-c05345982e04', '3 项目&区域目标填报表'),
]

def get(url, timeout=300):
    req = urllib.request.Request(BASE + url, headers=HDRS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return -1, {}, str(e).encode('utf-8', 'replace')

def xlsx_stat(buf):
    try:
        z = zipfile.ZipFile(__import__('io').BytesIO(buf))
        sheets = [n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)]
        rows = sum(z.read(s).count(b'<row ') for s in sheets)
        names = []
        if 'xl/workbook.xml' in z.namelist():
            names = re.findall(rb'<sheet[^>]*name="([^"]+)"', z.read('xl/workbook.xml'))
            names = [n.decode('utf-8', 'replace') for n in names]
        z.close()
        return len(sheets), rows, names
    except Exception as e:
        return 0, 0, ['解析失败:' + str(e)[:40]]

results = []
for fname, eid, label in REPORTS:
    print('\n===== ' + label + ' =====')
    dest = os.path.join(DL, fname)
    done = False
    for attempt in range(1, 4):
        print('  第 %d 轮：打开报表预览页' % attempt)
        st, hd, body = get('/webroot/decision/v10/entry/access/' + eid, timeout=90)
        html = body.decode('utf-8', 'replace')
        sidm = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', html)
        sid = sidm.group(0) if sidm else ''
        print('     HTTP=%s len=%s sessionID=%s' % (st, len(body), sid or '(无)'))
        if not sid:
            print('     预览页片段:', html[:260].replace('\n', ' '))
            time.sleep(2); continue
        if attempt == 1:
            open(os.path.join(OUT, 'preview_' + re.sub(r'[^a-zA-Z0-9]', '_', label)[:24] + '.html'), 'w', encoding='utf-8').write(html)

        for ext in ['simple', 'page', 'sheet']:
            u = '/webroot/decision/view/report?op=export&sessionID=' + sid + '&format=excel&extype=' + ext
            st2, hd2, b2 = get(u, timeout=300)
            isx = len(b2) > 1000 and b2[:2] == b'PK'
            print('     导出 extype=%-6s HTTP=%-3s len=%-9s xlsx=%s CT=%s' % (ext, st2, len(b2), isx, hd2.get('Content-Type', '')[:38]))
            if isx:
                open(dest, 'wb').write(b2)
                sh, rows, names = xlsx_stat(b2)
                print('     >>> 已保存', fname, len(b2), 'B | sheet', sh, names, '| 行', rows)
                results.append({'file': fname, 'label': label, 'ok': True, 'size': len(b2),
                                'extype': ext, 'sheets': sh, 'sheetNames': names, 'rows': rows, 'sessionID': sid})
                done = True
                break
            else:
                print('       非 xlsx 响应片段:', b2[:160].decode('utf-8', 'replace').replace('\n', ' ')[:150])
        if done: break
        print('     该轮未成功，重新生成报表会话再试')
        time.sleep(3)
    if not done:
        results.append({'file': fname, 'label': label, 'ok': False, 'err': '3 轮均未返回 xlsx'})
        print('  !!! 失败:', label)

print('\n===== 导出汇总 =====')
for r in results:
    print('  %-5s %-72s %s' % ('OK' if r['ok'] else 'FAIL', r['file'], ('%d B / %d sheet / %d 行' % (r['size'], r['sheets'], r['rows'])) if r['ok'] else r.get('err', '')))
json.dump({'at': datetime.datetime.now().isoformat(), 'user': d.get('user'), 'results': results},
          open(os.path.join(OUT, 'export_4_result.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('\n已保存结果 export_4_result.json')
