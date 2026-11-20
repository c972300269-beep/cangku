#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""列出 todo 页加载的 JS chunk，并下载搜索含'分派'的组件"""
import asyncio, shutil, tempfile, json, urllib.request, ssl
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmT_"))
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
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(5000)
        js = await page.evaluate("() => performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('.js'))")
        print("JS chunks:", len(js))
        for u in js:
            print("  ", u.split('/')[-1][:80])
        Path(OUT/"todo_chunks.json").write_text(json.dumps(js, ensure_ascii=False, indent=1), encoding="utf-8")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
