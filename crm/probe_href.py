#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取待办列表里 AI 工单行的链接 href，并尝试直接进入详情"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmQ_"))
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
        await page.wait_for_function("() => (document.body.innerText||'').includes('工作台')", timeout=90000)
        await page.wait_for_timeout(6000)

        # 抓取该行的所有链接 href
        hrefs = await page.evaluate("""(target) => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const r of rows) {
                if (r.textContent.includes(target)) {
                    const links = Array.from(r.querySelectorAll('a')).map(a=>({t:(a.innerText||'').trim(), href:a.getAttribute('href')||a.getAttribute('to')||''}));
                    return links;
                }
            }
            return [];
        }""", TARGET)
        print("行内链接 href:", json.dumps(hrefs, ensure_ascii=False))

        # 也抓 "查看更多" 的 href
        more = await page.evaluate("""() => Array.from(document.querySelectorAll('a,span,div')).filter(e=>(e.innerText||'').trim()==='查看更多').map(e=>({t:(e.innerText||'').trim(), href:e.getAttribute('href')||e.getAttribute('to')||'', cls:(e.className||'').toString().slice(0,40)}))""")
        print("查看更多:", json.dumps(more, ensure_ascii=False))

        # 尝试点 我的待办 菜单
        for sel in ["我的待办"]:
            loc = page.get_by_text(sel, exact=True)
            n = await loc.count()
            print(f"菜单[{sel}] count={n}")
            if n:
                el = loc.first
                if await el.is_visible():
                    b = await el.bounding_box()
                    if b:
                        await page.mouse.move(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
                        await page.wait_for_timeout(300)
                        await page.mouse.down(); await page.mouse.up()
                        await page.wait_for_timeout(5000)
                        print("点击后 URL:", page.url)
                        await page.screenshot(path=str(OUT/"mytodo.png"))

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
