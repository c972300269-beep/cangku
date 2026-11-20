#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""遍历 CRM 菜单，记录每个页面的路由与接口，摸清可查询范围"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CRM_BASE = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm_explore")
OUT.mkdir(parents=True, exist_ok=True)

MENUS = ["工作台", "草稿箱", "共享池", "我的待办", "我的已办", "我的创建", "单据创建", "服务追踪", "审批方案", "报表"]
captured = []


async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_crm_"))
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
                        "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except Exception:
                pass

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-gpu", "--window-size=1600,950"],
            ignore_https_errors=True, viewport={"width": 1600, "height": 950})
        page = context.pages[0] if context.pages else await context.new_page()

        async def on_req(req):
            if req.resource_type in ("xhr", "fetch") and ":28091/api" in req.url:
                u = req.url.split(":28091/api")[-1]
                try:
                    b = req.post_data
                except Exception:
                    b = None
                captured.append({"u": u, "post": (b or "")[:300]})

        page.on("request", on_req)

        await page.goto(CRM_BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(9000)

        report = []
        for m in MENUS:
            captured.clear()
            before = page.url
            ok = False
            try:
                loc = page.get_by_text(m, exact=True).first
                await loc.click(timeout=8000)
                ok = True
            except Exception as e:
                err = str(e).split("\n")[0][:80]
            await page.wait_for_timeout(6000)
            entry = {
                "menu": m, "clicked": ok, "url_before": before, "url_after": page.url,
                "apis": sorted({c["u"] + (" || " + c["post"] if c["post"] else "") for c in captured})[:8],
            }
            report.append(entry)
            print(f"\n[{m}] clicked={ok} url={page.url}")
            for a in entry["apis"]:
                print("   ", a[:220])

        Path(OUT / "menu_map.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
