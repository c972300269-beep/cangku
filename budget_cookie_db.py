#!/usr/bin/env python3
"""Read Chrome cookies from SQLite db (handles running Chrome)."""
import sys, os, json, shutil, sqlite3, tempfile
sys.path.insert(0, 'C:/Users/chenjialin3/.workbuddy/binaries/python/workspace/lib')

import requests

OUT = r'E:\workbuddy\Claw\reports'
ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002'

# Chrome cookie paths to try
cookie_paths = [
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies'),
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cookies'),
]

found = False
for db_path in cookie_paths:
    if os.path.exists(db_path):
        print(f'[1] 找到Cookie数据库: {db_path}')
        found = True
        break

if not found:
    print('❌ 找不到Chrome cookie数据库')
    sys.exit(1)

# Copy the db (Chrome may have it locked)
tmp_db = os.path.join(tempfile.gettempdir(), 'chrome_cookies_copy.db')
try:
    shutil.copy2(db_path, tmp_db)
    print(f'  复制到: {tmp_db}')
except Exception as e:
    print(f'❌ 复制失败: {e}')
    sys.exit(1)

# Read cookies
conn = sqlite3.connect(tmp_db)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get all cookies for the budget domain
cursor.execute("SELECT name, value, host_key FROM cookies WHERE host_key LIKE '%linli580%' OR host_key LIKE '%xfk%'")
rows = cursor.fetchall()
conn.close()

cookies = {}
for row in rows:
    cookies[row['name']] = row['value']

print(f'  提取到 {len(cookies)} 个cookie')
if cookies:
    print(f'  Keys: {list(cookies.keys())}')
else:
    print('  ❌ 没有预算系统的cookie, 请先在Chrome中打开xfk.linli580.cn并登录')
    # Cleanup
    os.unlink(tmp_db)
    sys.exit(1)

# Cleanup temp file
os.unlink(tmp_db)

print('[2] 调用预算API...')
session = requests.Session()
for name, value in cookies.items():
    session.cookies.set(name, value)

body = {
    'Q_main': {
        'PERIOD_S_EQ': 2026,
        'ORG_ID_S_IN': ORGS,
        'ACCOUNT_ID_S_EQ': '13403',
    },
    'page': 0,
    'size': 500,
}

headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0',
}

try:
    resp = session.post(
        'https://xfk.linli580.cn/api/api-budget/budget/view/detail/list',
        json=body, headers=headers, timeout=30
    )
    print(f'  Status: {resp.status_code}')
    
    if resp.status_code == 200 and len(resp.text) > 100:
        data = resp.json()
        out_path = os.path.join(OUT, 'budget_live_data.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        
        rows = data.get('list') or data.get('rows') or data.get('data') or data.get('records') or []
        total = data.get('total', len(rows))
        print(f'\n✓ 成功! 总记录数: {total}, 返回行数: {len(rows)}')
        
        if rows:
            print(f'  列: {list(rows[0].keys())}')
            # Print first 3 rows
            for i, row in enumerate(rows[:3]):
                print(f'  Row {i+1}: {json.dumps(row, ensure_ascii=False)[:200]}')
            
            # Generate Excel report
            print('\n[3] 生成Excel报告...')
            generate_report(data, rows, out_path.replace('.json', '.xlsx'))
        else:
            # Try without org/item filters
            print('  无数据, 尝试只按年份查询...')
            body2 = {'Q_main': {'PERIOD_S_EQ': 2026}, 'page': 0, 'size': 500}
            r2 = session.post(
                'https://xfk.linli580.cn/api/api-budget/budget/view/detail/list',
                json=body2, headers=headers, timeout=30
            )
            if r2.status_code == 200:
                d2 = r2.json()
                rows2 = d2.get('list') or d2.get('rows') or d2.get('data') or []
                print(f'  仅年份: {len(rows2)} 行')
    else:
        print(f'  响应: {resp.text[:500]}')
except Exception as e:
    print(f'  Error: {e}')

def generate_report(data, rows, xlsx_path):
    """Generate Excel from JSON data."""
    # We'll use the JSON to create xlsx via the XML template approach later
    # For now, save the raw data
    print(f'  数据已保存: {xlsx_path.replace(".xlsx", ".json")}')

print('\nDone')
