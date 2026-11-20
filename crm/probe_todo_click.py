#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 我的待办 完整列表页点开 AI 工单，捕获详情"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmR_"))
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
        xhrs = []
        page.on("request", lambda r: xhrs.append((r.method, r.url, (r.post_data or "")[:300])) if r.resource_type in ("xhr","fetch") else None)
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(5000)

        # 点行（尝试多种方式）
        row = page.locator(f"tr:has-text('{TARGET}')").first
        try:
            await row.click(timeout=6000)
        except Exception as e:
            print("row click err:", e)
        await page.wait_for_timeout(6000)
        print("URL after row click:", page.url)

        # 若没跳，找行内可点击元素
        if TARGET in page.url or "workbench" in page.url:
            # 尝试点 serial link
            try:
                await page.locator(f"tr:has-text('{TARGET}') a").first.click(timeout=4000)
            except Exception as e:
                print("link click err:", e)
            await page.wait_for_timeout(5000)
            print("URL after link click:", page.url)

        print("=== XHR ===")
        seen=set()
        for m,u,b in xhrs:
            if "28091" in u:
                k=m+" "+u.split("?")[0]
                if k in seen: continue
                seen.add(k)
                print(f"  {m} {u[:120]}")
                if b: print("     ", b[:200])

        btns = await page.evaluate("""() => Array.from(document.querySelectorAll('button,.ant-btn,span,a')).map(e=>({t:(e.innerText||'').trim(),cls:(e.className||'').toString().slice(0,30)})).filter(x=>x.t && (x.t==='分派'||x.t==='转派'||x.t==='处理'||x.t==='获取处理权'||x.t==='接单'||x.t==='详情'||x.t==='查看'))""")
        print("动作元素:", json.dumps(btns, ensure_ascii=False)[:600])
        await page.screenshot(path=str(OUT/"todo_click.png"))
        txt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,1200)")
        print("BODY:", txt.replace("\n"," | ")[:700])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
