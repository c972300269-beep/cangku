#!/usr/bin/env python3
"""探索 CRM 服务追踪/工单模块"""
import asyncio, json, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

CRM_BASE = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path.home() / "WorkBuddy" / "Claw" / "reports"

async def explore(page, url, label):
    print(f"\n=== {label} ===")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(4000)
        
        # Check for 403
        body_start = await page.evaluate("() => document.body ? document.body.innerText.substring(0, 200) : ''")
        if '403' in body_start or '无权' in body_start:
            print(f"  Access Denied")
            return None
        
        # Extract all navigation links
        nav = await page.evaluate("""() => {
            const links = [];
            document.querySelectorAll('a, .el-menu-item, .nav-item, [class*=nav], [class*=menu], [class*=sidebar] span, [class*=sidebar] div').forEach(el => {
                const t = el.textContent.trim();
                const href = el.href || el.getAttribute('data-url') || el.getAttribute('to') || '';
                if (t && t.length > 0 && t.length < 30) {
                    links.push({text: t, href: href});
                }
            });
            
            // Also check tab/button labels  
            document.querySelectorAll('.el-tabs__item, button, .tab-item').forEach(el => {
                const t = el.textContent.trim();
                if (t && t.length > 1 && t.length < 20) links.push({text: t, href: '', type: 'tab/btn'});
            });
            
            return links;
        }""")
        
        print(f"  Navigation: {json.dumps(nav, ensure_ascii=False)}")
        
        # Screenshot
        fname = OUT / f"crm_{label}.png"
        await page.screenshot(path=str(fname), full_page=False)
        print(f"  Screenshot: {fname}")
        
        # Extract table data
        table = await page.evaluate("""() => {
            const rows = document.querySelectorAll('table tbody tr, .el-table__body tr');
            const data = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, .el-table__cell');
                const rowData = [];
                cells.forEach(c => rowData.push(c.textContent.trim()));
                if (rowData.length > 0) data.push(rowData);
            });
            return data.slice(0, 20);
        }""")
        
        if table and table.length > 0 and table[0].length > 1:
            print(f"  Table ({len(table)} rows):")
            for row in table[:5]:
                print(f"    {row}")
        
        return nav
    except Exception as e:
        print(f"  Error: {e}")
        return None

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

        # Explore key modules
        modules = [
            (f"{CRM_BASE}#/app/service-track", "服务追踪"),
            (f"{CRM_BASE}#/app/service", "服务"),
            (f"{CRM_BASE}#/app/work-order", "工单"),
            (f"{CRM_BASE}#/app/workbench", "工作台-home"),
            (f"{CRM_BASE}#/app/dashboard", "工作台"),
        ]
        
        for url, label in modules:
            nav = await explore(page, url, label)
            
            # If we found navigation with work-order related items, click into them
            if nav and any('工单' in n.get('text','') or '服务' in n.get('text','') for n in nav):
                # Try to click into work order relevant menu items
                for n in nav:
                    if '工单' in n.get('text','') or '服务追踪' in n.get('text',''):
                        print(f"  -> Found relevant nav: {n['text']}")
        
        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
