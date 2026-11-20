#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全新上下文直接打开工单处理表单 URL，确认能否加载工单与分派按钮"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

FORM = "https://crm.linli580.cn:28092/#/form/repair?taskID=7853065&stepID=75887304&isPost=true&serialNum=WX2026102700498"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmY_"))
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
        # 监听网络，找 form 数据接口
        xhrs=[]
        page.on("request", lambda r: xhrs.append((r.method, r.url)) if r.resource_type in ("xhr","fetch") else None)
        await page.goto(FORM, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(9000)
        print("URL:", page.url)
        # 关闭可能的提示
        try:
            await page.get_by_text("知道了", exact=True).click(timeout=3000)
            await page.wait_for_timeout(2000)
        except Exception:
            pass
        btns = await page.evaluate("""() => Array.from(document.querySelectorAll('button,.ant-btn')).map(b=>(b.innerText||'').trim()).filter(Boolean)""")
        print("按钮:", json.dumps(list(dict.fromkeys(btns)), ensure_ascii=False)[:800])
        txt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,1600)")
        print("BODY:", txt.replace("\n"," | ")[:1200])
        await page.screenshot(path=str(OUT/"form_fresh.png"))
        print("=== XHR ===")
        for m,u in xhrs:
            if "28091" in u:
                print("  ", m, u[:120])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
