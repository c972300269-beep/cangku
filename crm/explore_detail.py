"""探索点击'获取处理权'后的页面变化"""
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

            # Get page structure before click
            before = await page.evaluate("""() => {
                return {
                    url: location.href,
                    bodyLen: document.body.innerText.length,
                    modals: document.querySelectorAll('.ant-modal, .ant-drawer, .el-dialog, [class*="modal"], [class*="drawer"], [class*="dialog"]').length,
                    // Check all links/buttons in the table
                    actionElements: Array.from(document.querySelectorAll('table tbody tr td:last-child *')).map(el => ({
                        tag: el.tagName,
                        text: el.textContent.trim(),
                        class: el.className,
                        onclick: el.onclick ? 'has' : 'none',
                        href: el.href || '',
                    })),
                };
            }""")
            print("=== BEFORE CLICK ===")
            print(json.dumps(before, ensure_ascii=False, indent=2))

            # Now click "获取处理权"
            dialog_log = []
            page.on("dialog", lambda d: dialog_log.append(f"DIALOG:{d.type}:{d.message}"))

            result = await page.evaluate("""() => {
                const cells = document.querySelectorAll('td');
                for (let cell of cells) {
                    if (cell.textContent.includes('获取处理权')) {
                        cell.click();
                        return 'clicked_cell';
                    }
                }
                // Try inner elements
                const links = document.querySelectorAll('a, button');
                for (let el of links) {
                    if (el.textContent.includes('获取处理权')) {
                        el.click();
                        return 'clicked_' + el.tagName;
                    }
                }
                return 'not_found';
            }""")
            print(f"\n=== CLICK RESULT: {result} ===")
            print(f"Dialogs: {dialog_log}")

            await page.wait_for_timeout(3000)

            # Check after click
            after = await page.evaluate("""() => {
                return {
                    url: location.href,
                    bodyLen: document.body.innerText.length,
                    modals: document.querySelectorAll('.ant-modal, .ant-drawer, .el-dialog, [class*="modal"], [class*="drawer"], [class*="dialog"]').length,
                    // Look for any new buttons
                    allButtons: Array.from(document.querySelectorAll('button')).map(b => ({
                        text: b.textContent.trim().substring(0, 30),
                        class: b.className,
                    })),
                    // Check for tabs or new panels
                    tabs: Array.from(document.querySelectorAll('[class*="tab"], [class*="Tab"]')).map(t => ({
                        text: t.textContent.trim().substring(0, 30),
                    })),
                    // Body text excerpt
                    bodyExcerpt: document.body.innerText.substring(0, 2000),
                };
            }""")
            print("\n=== AFTER CLICK ===")
            print(json.dumps(after, ensure_ascii=False, indent=2))

            # Also check if the page navigated
            print(f"\nCurrent URL: {page.url}")

        finally:
            await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

asyncio.run(main())
