#!/usr/bin/env python3
"""CRM 截图 + 页面文本提取，诊断工单页面结构"""
import asyncio, shutil, tempfile
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright

CRM_BASE = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path.home() / "WorkBuddy" / "Claw" / "reports"

async def screenshot_and_extract(page, url, label):
    print(f"\n=== {label} ===")
    print(f"URL: {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(5000)
        
        # Screenshot
        fname = OUT / f"crm_{label}.png"
        await page.screenshot(path=str(fname), full_page=False)
        print(f"Screenshot: {fname}")
        
        # Extract all visible text
        text = await page.evaluate("""() => {
            return document.body ? document.body.innerText.substring(0, 3000) : 'NO BODY';
        }""")
        print(f"--- Page Text ---")
        print(text[:2000])
        
        # Try to find all links/buttons/navigation
        nav = await page.evaluate("""() => {
            const items = [];
            document.querySelectorAll('a, .nav-item, .menu-item, .tab, [class*=nav], [class*=menu], [class*=tab]').forEach(el => {
                const t = el.textContent.trim();
                if (t && t.length > 0 && t.length < 30) items.push(t);
            });
            return items.slice(0, 50);
        }""")
        if nav:
            print(f"--- Navigation ---")
            print(json.dumps(nav, ensure_ascii=False))
        
        return text
    except Exception as e:
        print(f"Error: {e}")
        return ""

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

        urls = [
            (f"{CRM_BASE}#/app/shared-pool", "shared_pool"),
            (f"{CRM_BASE}#/app/my-tickets", "my_tickets"),
        ]
        
        for url, label in urls:
            await screenshot_and_extract(page, url, label)

        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
