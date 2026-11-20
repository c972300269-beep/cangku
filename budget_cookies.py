#!/usr/bin/env python3
"""Extract Chrome cookies and call budget API directly."""
import sys, os, json, time
sys.path.insert(0, 'C:/Users/chenjialin3/.workbuddy/binaries/python/workspace/lib')

import browser_cookie3
import requests

OUT = r'E:\workbuddy\Claw\reports'
ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002'
API_URL = 'https://xfk.linli580.cn/api/api-budget/budget/view/detail/list'

print('[1] 从Chrome提取cookie...')

# Try to get cookies for the budget domain
cookies = None
for browser_fn in [browser_cookie3.chrome, browser_cookie3.brave, browser_cookie3.edge]:
    try:
        cj = browser_fn(domain_name='xfk.linli580.cn')
        cookies = {c.name: c.value for c in cj}
        if cookies:
            print(f'  从Chrome获取到 {len(cookies)} 个cookie')
            break
    except Exception as e:
        pass

if not cookies:
    print('  ❌ 无法从浏览器提取cookie (Chrome可能正在运行)')
    sys.exit(1)

print(f'  Cookie keys: {list(cookies.keys())}')

print('[2] 调用预算API...')
headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0',
}

body = {
    'Q_main': {
        'PERIOD_S_EQ': 2026,
        'ORG_ID_S_IN': ORGS,
        'ACCOUNT_ID_S_EQ': '13403',
    },
    'page': 0,
    'size': 500,
}

session = requests.Session()
for name, value in cookies.items():
    session.cookies.set(name, value)

try:
    resp = session.post(API_URL, json=body, headers=headers, timeout=30)
    print(f'  Status: {resp.status_code}')
    print(f'  Preview: {resp.text[:300]}')
    
    if resp.status_code == 200 and len(resp.text) > 100:
        data = resp.json()
        rows = data.get('list') or data.get('rows') or data.get('data') or data.get('records') or []
        
        out_path = os.path.join(OUT, 'budget_live_data.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        
        print(f'\n✓ 数据已保存: {out_path}')
        total = data.get('total', len(rows))
        print(f'  总记录数: {total}')
        print(f'  行数: {len(rows)}')
        if rows:
            print(f'  列: {list(rows[0].keys())[:10]}')
    elif resp.status_code == 401:
        print('  401 - Cookie过期, 需要你在Chrome中刷新预算页面后重试')
    elif resp.status_code == 403:
        print('  403 - IP或请求被拦截')
    else:
        print(f'  未知响应')
except Exception as e:
    print(f'  Error: {e}')
    # Try with different parameter formats
    print('\n  尝试不同参数格式...')
    formats = [
        {'Q_main': {'PERIOD_S_EQ': '2026'}, 'page': 0, 'size': 500},
        {'PERIOD_S_EQ': '2026', 'page': 0, 'size': 500},
        {'Q_main': {'PERIOD_S_EQ': '2026', 'ORG_ID_S_IN': ORGS}, 'page': 0, 'size': 500},
        {},  # Empty body
    ]
    for fmt in formats:
        try:
            r = session.post(API_URL, json=fmt, headers=headers, timeout=15)
            print(f'  {json.dumps(fmt)[:60]} -> status={r.status_code}, {r.text[:100]}')
            if r.status_code == 200 and len(r.text) > 100:
                data = r.json()
                out_path = os.path.join(OUT, 'budget_live_data.json')
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False)
                rows = data.get('list') or data.get('rows') or data.get('data') or []
                print(f'  ✓ 成功! {len(rows)} 行')
                break
        except:
            pass

print('\nDone')
