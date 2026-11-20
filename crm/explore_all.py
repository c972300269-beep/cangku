#!/usr/bin/env python3
"""CRM: 展开服务追踪子菜单，列出所有工单相关页面"""
import asyncio, json, shutil, tempfile
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright

CRM_BASE = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

async def check_page(page, label, check_url=None):
    """Check current page for work orders"""
    url = page.url
    body_start = await page.evaluate("() => document.body ? document.body.innerText.substring(0, 500) : ''")
    
    if '403' in body_start or '无权' in body_start:
        return {'label': label, 'url': url, 'status': 'denied'}

    # Extract table data
    tables = await page.evaluate("""() => {
        const rows = document.querySelectorAll('table tbody tr, .el-table__body tr');
        const data = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('td, .el-table__cell');
            const rd = [];
            cells.forEach(c => rd.push(c.textContent.trim().substring(0, 80)));
            if (rd.length > 0) data.push(rd);
        });
        return data;
    }""")
    
    # Filter out "暂无数据" rows
    real_data = [r for r in tables if len(r) > 1 and not any('暂无数据' in c for c in r)]
    
    return {
        'label': label,
        'url': url,
        'count': len(real_data),
        'rows': real_data[:20]
    }

async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_crm_"))
    for item in ["Default", "Local State"]:
        src = CHROME_USER_DATA / item
        dst = temp_dir / item
        if src.exists():
            try:
                if src.is_dir():
                    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache",
                        "Service Worker","IndexedDB","blob_storage",
                        "File System","shared_proto_db","WebStorage",
                        "Extensions","Crashpad",
                    ), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except: pass

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir),
            headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu","--window-size=1440,900"],
            ignore_https_errors=True,
            viewport={"width":1440,"height":900},
        )
        page = context.pages[0] if context.pages else await context.new_page()

        # First expand "服务追踪" submenu to see what's inside
        print("打开共享池...")
        await page.goto(f"{CRM_BASE}#/app/shared-pool", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(5000)

        # Click "服务追踪" to expand it
        print("展开'服务追踪'子菜单...")
        await page.evaluate("""() => {
            for (const el of document.querySelectorAll('*')) {
                if (el.textContent.trim() === '服务追踪') {
                    el.click();
                    break;
                }
            }
        }""")
        await page.wait_for_timeout(3000)

        # Now get ALL navigation items including submenu items
        print("\n=== 完整菜单结构 ===")
        all_items = await page.evaluate("""() => {
            const items = [];
            document.querySelectorAll('.ant-menu-item, .ant-menu-submenu-title, [class*=menu] li, [class*=menu] a').forEach(el => {
                const text = el.textContent.trim().replace(/\\s+/g, ' ');
                const href = el.href || '';
                const cls = el.className || '';
                if (text && text.length > 1 && text.length < 40) {
                    items.push({text, href, cls: cls.substring(0, 60)});
                }
            });
            return items;
        }""")
        for item in all_items:
            print(f"  [{item['cls'].split(' ')[0]}] {item['text']}")

        # Check each menu item for work orders
        menu_pages = []
        for item in all_items:
            text = item['text']
            if any(kw in text for kw in ['待办', '工单', '服务', '单据', '创建', '已办', '共享', '草稿']):
                menu_pages.append(text)

        print(f"\n=== 逐一检查工单相关页面 ===")
        results = []
        for page_name in menu_pages:
            try:
                # Click the menu item
                clicked = await page.evaluate(f"""(name) => {{
                    for (const el of document.querySelectorAll('*')) {{
                        if (el.textContent.trim() === name && (el.className.includes('menu') || el.tagName === 'LI' || el.tagName === 'A')) {{
                            el.click();
                            return true;
                        }}
                    }}
                    return false;
                }}""", page_name)
                await page.wait_for_timeout(4000)
                
                result = await check_page(page, page_name)
                results.append(result)
                print(f"  [{page_name}] url={result['url'].split('#')[-1] if '#' in result['url'] else result['url']} count={result['count']}")
                if result['rows']:
                    for row in result['rows'][:5]:
                        print(f"    {row}")
            except Exception as e:
                print(f"  [{page_name}] Error: {e}")

        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

    # Summary
    print(f"\n{'='*50}")
    print("=== 汇总 ===")
    for r in results:
        status = f"{r['count']}条" if r.get('status') != 'denied' else '无权限'
        print(f"  {r['label']}: {status}")

if __name__ == "__main__":
    asyncio.run(main())
