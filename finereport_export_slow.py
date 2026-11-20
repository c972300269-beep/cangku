# 慢速重导剩余 3 张报表：平台有 11300015「访问频率过高」限流，必须放慢节奏、单次请求、失败不轰炸
# 每张：打开预览页 -> 等报表计算 -> 导出 1 次（必要时最多再试 1 次）-> 张与张之间间隔 60s
import json, os, re, io, time, zipfile, datetime, urllib.request, urllib.error

# ⛔ 停工闸门（2026-11-06 13:35，用户明确要求「不要频繁访问」）
# 出口 IP 已被帆软 11300015 拉进拦截名单，连用户本人浏览器都被挡。
# 未经用户明确许可（管理员移出拦截 / 换出口 IP）不得再向平台发任何请求，包括「探测是否解除」。
if os.environ.get('FR_ALLOW') != '1':
    print('STOP: 平台访问已停工（错误码 11300015，IP 级黑名单）。')
    print('      需用户确认拦截解除后，显式设置 FR_ALLOW=1 才允许运行本脚本。')
    raise SystemExit(0)

BASE = 'http://10.1.232.246:8089'
S = r'E:\workbuddy\Claw\.workbuddy\finereport_session_user.json'
DL = r'E:\workbuddy\Claw\reports\家庭消费数据_平台导出_20261106'
OUT = r'E:\workbuddy\Claw\reports\finereport'
d = json.load(open(S, encoding='utf-8-sig'))
cookies = {c['name']: c['value'] for c in d['cookies']}
token = cookies.get('fine_auth_token', '')
HDRS = {'Cookie': '; '.join('%s=%s' % (k, v) for k, v in cookies.items()),
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
        'Accept': '*/*'}

REPORTS = [
    (2, '1-05邻里精选_02-家庭消费数据报表_2_家庭消费数据层级报表（楼栋→项目→公司→集团）.xlsx',
     '70daa864-b8c2-49e9-913c-024c4897a71d', '2 家庭消费数据层级报表'),
    (3, '1-1_家庭消费房间明细表_住宅.xlsx',
     '9b8028a3-90d7-457a-8824-8d6484cd31d1', '1-1 家庭消费房间明细表_住宅'),
    (4, '3_项目&区域目标填报表.xlsx',
     '49adbe80-de8d-4d9c-a2a6-c05345982e04', '3 项目&区域目标填报表'),
]
ONLY = os.environ.get('FR_ONLY', '')  # 可指定单张序号，逗号分隔

def get(url, timeout=180):
    req = urllib.request.Request(BASE + url, headers=HDRS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return -1, {}, ('EXC:' + str(e)).encode('utf-8', 'replace')

def stat(buf):
    try:
        z = zipfile.ZipFile(io.BytesIO(buf))
        sh = [n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)]
        rows = sum(z.read(s).count(b'<row ') for s in sh)
        names = [n.decode('utf-8', 'replace') for n in re.findall(rb'<sheet[^>]*name="([^"]+)"', z.read('xl/workbook.xml'))] if 'xl/workbook.xml' in z.namelist() else []
        z.close()
        return len(sh), rows, names
    except Exception as e:
        return 0, 0, ['解析失败']

def log(s):
    print('[%s] %s' % (datetime.datetime.now().strftime('%H:%M:%S'), s), flush=True)

results = []
processed = 0
for idx, fname, eid, label in REPORTS:
    if ONLY and str(idx) not in ONLY.split(','):
        continue
    log('===== 第 %d 张：%s =====' % (idx, label))
    if processed:
        log('  间隔 60s 规避平台限流')
        time.sleep(60)
    processed += 1
    dest = os.path.join(DL, fname)
    ok = False
    for attempt in range(1, 3):
        if attempt > 1:
            log('  第 2 次尝试前等待 40s')
            time.sleep(40)
        st, hd, body = get('/webroot/decision/v10/entry/access/' + eid, timeout=180)
        html = body.decode('utf-8', 'replace')
        blocked = '11300015' in html or 'No_Privilege_Access_Page' in html
        m = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', html)
        sid = m.group(0) if m else ''
        log('  预览页 HTTP=%s len=%s sid=%s 限流=%s' % (st, len(body), sid[:8] or '(无)', blocked))
        if blocked:
            log('  仍在限流，等待 90s 后重试')
            time.sleep(90)
            continue
        if not sid:
            log('  预览页无 sessionID，片段: ' + html[:120].replace('\n', ' '))
            continue
        # 报表计算需要时间，先等再导出
        time.sleep(12)
        u = '/webroot/decision/view/report?op=export&sessionID=' + sid + '&format=excel&extype=simple'
        st2, hd2, b2 = get(u, timeout=300)
        isx = len(b2) > 1000 and b2[:2] == b'PK'
        log('  导出 HTTP=%s len=%s xlsx=%s CT=%s' % (st2, len(b2), isx, hd2.get('Content-Type', '')[:40]))
        if not isx:
            log('  响应片段: ' + b2[:120].decode('utf-8', 'replace').replace('\n', ' ')[:110])
            # 空响应常见于报表尚未算完，等一会儿再取一次（不再换 extype，避免请求轰炸）
            time.sleep(25)
            st3, hd3, b3 = get(u, timeout=300)
            if len(b3) > 1000 and b3[:2] == b'PK':
                st2, b2, isx = st3, b3, True
                log('  延时重取成功 len=%s' % len(b2))
        if isx:
            open(dest, 'wb').write(b2)
            sh, rows, names = stat(b2)
            log('  >>> 已保存 %s | %d B | sheet=%s %s | 行=%d' % (fname, len(b2), sh, names, rows))
            results.append({'idx': idx, 'file': fname, 'ok': True, 'size': len(b2), 'sheets': sh, 'sheetNames': names, 'rows': rows})
            ok = True
            break
    if not ok:
        log('  !!! 第 %d 张未导出' % idx)
        results.append({'idx': idx, 'file': fname, 'ok': False})

log('===== 汇总 =====')
for r in results:
    log('  %s %s %s' % ('OK' if r['ok'] else 'FAIL', r['file'], ('%d B / %d 行' % (r['size'], r['rows'])) if r['ok'] else ''))
json.dump({'at': datetime.datetime.now().isoformat(), 'user': d.get('user'), 'results': results},
          open(os.path.join(OUT, 'export_slow_result.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
