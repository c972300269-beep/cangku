#!/usr/bin/env python3
"""Budget data fetcher using DrissionPage for stealth bypass."""
import sys, os, json, time

sys.path.insert(0, 'C:/Users/chenjialin3/.workbuddy/binaries/python/workspace/lib')

from DrissionPage import ChromiumPage, ChromiumOptions

OUT = r'E:\workbuddy\Claw\reports'
ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002'

# Configure stealth options
co = ChromiumOptions()
co.set_argument('--disable-blink-features=AutomationControlled')
co.set_argument('--no-first-run')
co.set_argument('--window-size=1920,1080')
co.set_argument('--disable-features=IsolateOrigins')
# Try headed first
co.headless(False)

print('[0] 启动DrissionPage隐形浏览器...')
page = ChromiumPage(co)

print('[1] 访问预算系统...')
page.get('https://xfk.linli580.cn/', timeout=60)
time.sleep(8)

title = page.title
print(f'  标题: {title}')

# Check if we hit a login page or the main page
html = page.html[:500]
print(f'  HTML预览: {html[:200]}')

if '403' in title or 'Forbidden' in title or 'forbidden' in html.lower():
    print('  ❌ 403 - DrissionPage也被拦截')
    print('  需要手动在浏览器中登录, 等待60秒...')
    time.sleep(60)
    title = page.title
    print(f'  标题: {title}')

if '403' not in title and 'Forbidden' not in title:
    print('  ✓ 页面正常!')
    
    # Try XHR with the authenticated session
    print('[2] XHR请求数据...')
    
    js_code = f'''
    return new Promise((resolve) => {{
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.onload = () => resolve(JSON.stringify({{status: xhr.status, text: xhr.responseText}}));
        xhr.onerror = () => resolve(JSON.stringify({{error: 'xhr failed'}}));
        xhr.send(JSON.stringify({{Q_main: {{PERIOD_S_EQ: 2026, ORG_ID_S_IN: '{ORGS}', ACCOUNT_ID_S_EQ: '13403'}}, page: 0, size: 500}}));
    }});
    '''
    
    result = page.run_js(js_code)
    result = json.loads(result)
    print(f'  Status: {result.get("status")}')
    print(f'  Preview: {(result.get("text") or result.get("error") or "")[:300]}')
    
    if result.get('status') == 200 and result.get('text') and len(result['text']) > 100:
        data = json.loads(result['text'])
        out_path = os.path.join(OUT, 'budget_live_data.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(result['text'])
        
        rows = data.get('list') or data.get('rows') or data.get('data') or data.get('records') or []
        print(f'  ✓ 保存: {out_path}')
        print(f'  记录数: {data.get("total") or len(rows)}')
        
        if rows:
            print(f'  列: {list(rows[0].keys())[:10]}')
    else:
        # Try to trigger the real query from the UI
        print('\n[3] 尝试触发UI查询...')
        page.run_js('''
            let vm = document.querySelector('.el-form').__vue__;
            while (vm) {
                if (vm.$options.name === 'HProQueryTemplate' && vm.handleQuery) {
                    vm.handleQuery();
                    return 'ok';
                }
                vm = vm.$parent;
            }
            return 'not found';
        ''')
        time.sleep(8)
        print('  UI查询已触发')

print('\nDone - 浏览器保持打开')
time.sleep(3)
