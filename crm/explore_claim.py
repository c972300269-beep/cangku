#!/usr/bin/env python3
"""探索共享池页面结构，找认领按钮的正确点击方式"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CRM_URL = "https://times-crm.timesgroup.cn:28092/html/App.html#/app/shared-pool"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_"))
    for item in ["Default", "Local State"]:
        src = CHROME_USER_DATA / item
        dst = temp_dir / item
        if src.exists():
            try:
                if src.is_dir():
                    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache",
                        "Service Worker", "IndexedDB", "blob_storage",
                        "File System", "shared_proto_db", "WebStorage",
                        "Extensions", "Crashpad",
                    ), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except: pass

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-sandbox"],
            ignore_https_errors=True, viewport={"width": 1440, "height": 900},
        )
        page = context.pages[0] if context.pages else await context.new_page()
        try:
            await page.goto(CRM_URL, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(5000)

            if "login" in page.url.lower():
                print("LOGIN_REQUIRED"); return

            # Explore the last cell structure
            info = await page.evaluate("""() => {
                const rows = document.querySelectorAll('table tbody tr');
                if (rows.length === 0) return {error: 'no rows'};
                const lastCell = rows[0].querySelectorAll('td');
                const lc = lastCell[lastCell.length - 1];
                return {
                    rowCount: rows.length,
                    cellCount: lastCell.length,
                    lastCellHTML: lc ? lc.innerHTML.substring(0, 500) : 'null',
                    lastCellText: lc ? lc.textContent.trim() : 'null',
                    lastCellTag: lc ? lc.tagName : 'null',
                    orderNo: lastCell[0] ? lastCell[0].textContent.trim() : 'null',
                    // Find any clickable elements in the row
                    clickables: Array.from(rows[0].querySelectorAll('a, button, span[onclick], [class*="btn"], [class*="link"]')).map(el => ({
                        tag: el.tagName,
                        text: el.textContent.trim().substring(0, 50),
                        class: el.className,
                        href: el.href || '',
                    })),
                    // Full row HTML of first row
                    firstRowHTML: rows[0].innerHTML.substring(0, 3000),
                };
            }""")
            print(json.dumps(info, ensure_ascii=False, indent=2))

        finally:
            await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

asyncio.run(main())
