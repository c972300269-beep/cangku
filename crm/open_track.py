#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""进入 CR7 服务追踪页(#/admin/trackList)，按单号搜索未找到的 7 条"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://crm.linli580.cn:28092/#/admin/trackList"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)
caps = []

MISS = ["WX2026091400235", "WX2026090900256", "WX2026091100147",
        "WX2026091400205", "WX2026091100230", "WX2026091400201", "WX2026091100200"]


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crm9_"))
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
        page.on("request", lambda r: caps.append((r.method, r.url, (r.post_data or "")[:300]))
                if r.resource_type in ("xhr", "fetch") else None)

        await page.goto(BASE, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(22000)
        print("URL:", page.url)
        bt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,1800)")
        print("=== BODY ===")
        print(bt[:1500])
        await page.screenshot(path=str(OUT / "track_1.png"))

        ctl = await page.evaluate("""() => {
            const inp = Array.from(document.querySelectorAll('input')).filter(i=>i.offsetParent!==null)
               .map(i=>({ph:i.placeholder||'', cls:(i.className||'').slice(0,50)}));
            const btn = Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent!==null)
               .map(b=>(b.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);
            return {inputs: inp.slice(0,15), buttons: Array.from(new Set(btn)).slice(0,20)};
        }""")
        print("=== CONTROLS ===")
        print(json.dumps(ctl, ensure_ascii=False, indent=1)[:1500])

        print("=== XHR ===")
        for m, u, b in caps:
            if "28091" in u:
                print(f"  {m} {u[:130]}")
                if b:
                    print(f"      {b[:220]}")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
