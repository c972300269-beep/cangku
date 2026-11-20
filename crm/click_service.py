#!/usr/bin/env python3
"""CRM: 从共享池页面通过导航菜单进入工单模块"""
import asyncio, json, shutil, tempfile
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright

CRM_BASE = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

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

        # Start at shared-pool which we know works
        print("打开共享池...")
        await page.goto(f"{CRM_BASE}#/app/shared-pool", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(5000)

        # Extract full sidebar navigation
        print("\n=== 侧边栏/菜单导航 ===")
        nav_items = await page.evaluate("""() => {
            const items = [];
            // Try multiple selector patterns for navigation
            const selectors = [
                '.el-menu-item',
                '.sidebar-item', 
                '.nav-item',
                '.menu-item',
                '[class*=sidebar] [class*=item]',
                '[class*=nav] a',
                '[class*=menu] li',
                'aside a',
                'aside li',
                '.el-submenu__title',
                '[class*=left] [class*=menu] span',
                '[class*=left] [class*=menu] div',
            ];
            
            const seen = new Set();
            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => {
                    const text = el.textContent.trim();
                    const href = el.href || el.getAttribute('data-url') || '';
                    const cls = el.className || '';
                    if (text && text.length > 1 && text.length < 30 && !seen.has(text)) {
                        seen.add(text);
                        items.push({text, href, cls: cls.substring(0, 80)});
                    }
                });
            }
            return items;
        }""")
        
        for item in nav_items:
            print(f"  {item['text']} -> {item['href']} [{item['cls']}]")

        # Try clicking on "服务追踪" 
        print("\n=== 尝试点击'服务追踪' ===")
        clicked = await page.evaluate("""() => {
            const links = [];
            document.querySelectorAll('*').forEach(el => {
                const t = el.textContent.trim();
                if (t === '服务追踪' || t.includes('服务追踪')) {
                    links.push({tag: el.tagName, cls: el.className, text: t});
                }
            });
            
            // Try to click
            for (const el of document.querySelectorAll('*')) {
                if (el.textContent.trim() === '服务追踪') {
                    el.click();
                    return {clicked: true, tag: el.tagName};
                }
            }
            return {clicked: false, found: links};
        }""")
        print(f"  {json.dumps(clicked, ensure_ascii=False)}")
        await page.wait_for_timeout(5000)

        # Check what page we're on now
        url = page.url
        body_text = await page.evaluate("() => document.body ? document.body.innerText.substring(0, 1000) : ''")
        print(f"\n  当前URL: {url}")
        print(f"  页面内容:\n{body_text[:800]}")

        # Extract any tables
        tables = await page.evaluate("""() => {
            const rows = document.querySelectorAll('table tbody tr, .el-table__body tr, .el-table tbody tr');
            const data = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, .el-table__cell');
                const rd = [];
                cells.forEach(c => rd.push(c.textContent.trim().substring(0, 50)));
                if (rd.length > 0 && rd.some(c => c.length > 0)) data.push(rd);
            });
            return data.slice(0, 30);
        }""")
        
        if tables and len(tables) > 0:
            print(f"\n=== 数据表格 ({len(tables)} 行) ===")
            for row in tables[:15]:
                print(f"  {row}")

        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
