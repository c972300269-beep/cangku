#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探测候选 SRM 系统地址能否打开（复用 Chrome 登录态）"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)

CANDIDATES = [
    "https://srm.timesgroup.cn/",
    "https://srm.linli580.cn/",
    "https://portal.linli580.cn/",
    "https://srm.timesgroup.com.cn/",
    "https://epp.linli580.cn/",
    "https://scm.timesgroup.cn/",
]

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_srm_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache", "Service Worker",
                        "IndexedDB", "blob_storage", "File System", "shared_proto_db",
                        "WebStorage", "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass
    results = []
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-gpu", "--window-size=1400,900"],
            ignore_https_errors=True, viewport={"width": 1400, "height": 900})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        for url in CANDIDATES:
            rec = {"url": url}
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(4000)
                rec["http"] = resp.status if resp else None
                rec["final_url"] = page.url
                rec["title"] = await page.title()
                txt = await page.evaluate("() => (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,300)")
                rec["text"] = txt
            except Exception as e:
                rec["error"] = str(e)[:160]
            results.append(rec)
            print("=" * 70)
            print(url)
            print("  http:", rec.get("http"), "| final:", rec.get("final_url"))
            print("  title:", rec.get("title"))
            print("  text:", (rec.get("text") or rec.get("error") or "")[:200])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)
    Path(OUT / "srm_probe.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n保存:", OUT / "srm_probe.json")

asyncio.run(main())
