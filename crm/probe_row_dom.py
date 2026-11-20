#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""dump AI 工单所在行的 DOM，定位可点击元素，并尝试 JS 触发点击"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmS_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db","WebStorage",
                        "Extensions","Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomatedControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(5000)

        html = await page.evaluate("""(target) => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const r of rows) {
                if (r.textContent.includes(target)) {
                    return r.outerHTML.slice(0, 2000);
                }
            }
            return 'ROW NOT FOUND';
        }""", TARGET)
        print("=== ROW HTML ===")
        print(html)

        # 尝试 JS 点击 a
        res = await page.evaluate("""(target) => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const r of rows) {
                if (r.textContent.includes(target)) {
                    const a = r.querySelector('a');
                    if (a) { a.click(); return 'clicked a'; }
                    // 尝试找 onclick 元素
                    const cl = r.querySelector('[onclick], [role=button], .ant-table-row, .clickable');
                    if (cl) { cl.click(); return 'clicked child'; }
                    r.click(); return 'clicked tr';
                }
            }
            return 'none';
        }""", TARGET)
        print("JS click result:", res)
        await page.wait_for_timeout(6000)
        print("URL after JS click:", page.url)
        await page.screenshot(path=str(OUT/"jsclick.png"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
