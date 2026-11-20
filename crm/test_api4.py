#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用页面自身 fetch（带 authorization）试调工单列表接口，确认参数与返回结构"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

TESTS = [
    ("/api/WorkOrder/GetMyCreateTaskList", {"pageIndex": 1, "pageSize": 5}),
    ("/api/WorkOrder/GetWorkOrderTaskList", {"pageIndex": 1, "pageSize": 5}),
    ("/api/WorkOrder/GetMyApprovalTaskList", {"pageIndex": 1, "pageSize": 5}),
    ("/api/WorkOrder/GetShareTaskList", {"pageIndex": 1, "pageSize": 5}),
]


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crm7_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache",
                        "Service Worker", "IndexedDB", "blob_storage",
                        "File System", "shared_proto_db", "WebStorage",
                        "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-gpu"],
            ignore_https_errors=True, viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(22000)

        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("token len", len(tok))

        js = """async ([url, body, tok]) => {
            try {
                const r = await fetch(url, {method:'POST',
                    headers:{'Content-Type':'application/json','authorization':tok},
                    body: JSON.stringify(body)});
                const t = await r.text();
                return r.status + ' :: ' + t;
            } catch(e) { return 'ERR ' + e.message; }
        }"""
        for path, body in TESTS:
            res = await page.evaluate(js, [API + path, body, tok])
            print("\n" + "=" * 70)
            print(path)
            print("  ", res[:1200].replace("\n", " "))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
