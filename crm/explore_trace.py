#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""进入"服务追踪"页面，dump 查询控件与列表接口"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)
caps = []


async def click_menu(page, name):
    ok = await page.evaluate("""(nm) => {
        const els = Array.from(document.querySelectorAll('a,li,span,div,p'));
        const cand = els.filter(e => (e.innerText||'').trim().startsWith(nm) && e.offsetParent !== null && (e.innerText||'').trim().length < 20);
        if (!cand.length) return false;
        cand.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);
        cand[0].click();
        return true;
    }""", name)
    return ok


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crm6_"))
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

        def on_req(r):
            if r.resource_type in ("xhr", "fetch"):
                caps.append({"m": r.method, "u": r.url, "post": (r.post_data or "")[:400]})

        page.on("request", on_req)
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(20000)

        for menu in ["服务追踪", "我的已办", "我的创建"]:
            caps.clear()
            ok = await click_menu(page, menu)
            await page.wait_for_timeout(9000)
            print("\n" + "=" * 70)
            print(f"[{menu}] clicked={ok} url={page.url}")
            await page.screenshot(path=str(OUT / f"menu_{menu}.png"))
            bt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,1500)")
            print("BODY:", bt.replace("\n", " | ")[:1100])
            for c in caps:
                if "28091" in c["u"]:
                    print(f"   {c['m']} {c['u'][:150]}")
                    if c["post"]:
                        print(f"        {c['post'][:250]}")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
