#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""点击 serial 触发新标签，捕获其 URL，在当前页导航过去渲染详情，找 分派 按钮"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmX_"))
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
        new_urls = []
        async def on_new(pg):
            new_urls.append(pg.url)
            print("NEW TAB opened:", pg.url)
        ctx.on("page", on_new)
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(5000)

        box = await page.evaluate("""(target) => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const r of rows) {
                if (r.textContent.includes(target)) {
                    const a = r.querySelector('a');
                    const b = (a||r).getBoundingClientRect();
                    return {x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2)};
                }
            }
            return null;
        }""", TARGET)
        await page.mouse.move(box["x"], box["y"])
        await page.wait_for_timeout(300)
        await page.mouse.down(); await page.mouse.up()
        await page.wait_for_timeout(4000)
        print("captured new_urls:", new_urls)
        # 关闭新标签
        for pg in ctx.pages:
            if pg != page:
                await pg.close()

        # 用新标签 URL 在当前页导航（若有）
        if new_urls:
            await page.goto(new_urls[0], wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(8000)
            print("navigated URL:", page.url)
            btns = await page.evaluate("""() => Array.from(document.querySelectorAll('button,.ant-btn')).map(b=>(b.innerText||'').trim()).filter(Boolean)""")
            print("按钮:", json.dumps(list(dict.fromkeys(btns)), ensure_ascii=False)[:800])
            await page.screenshot(path=str(OUT/"detail_v2.png"))
            txt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,1600)")
            print("BODY:", txt.replace("\n"," | ")[:1000])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
