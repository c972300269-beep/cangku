#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""点击 AI 工单行(serial)→ 新标签页打开详情 → 列出动作按钮与责任人选择"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmV_"))
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
        await page.wait_for_timeout(6000)

        # 找新标签页
        pages = ctx.pages
        print("页面数:", len(pages))
        detail = None
        for pg in pages:
            t = await pg.evaluate("() => document.body.innerText||''")
            if TARGET in t and ("分派" in t or "处理" in t or "工单" in t):
                detail = pg
                break
        if detail is None and len(pages) > 1:
            detail = pages[-1]
        if detail is None:
            print("未找到详情页")
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        await detail.wait_for_timeout(4000)
        await detail.screenshot(path=str(OUT/"detail_tab.png"), full_page=False)
        print("详情页 URL:", detail.url)
        btns = await detail.evaluate("""() => Array.from(document.querySelectorAll('button,.ant-btn')).map(b=>(b.innerText||'').trim()).filter(Boolean)""")
        print("按钮:", json.dumps(list(dict.fromkeys(btns)), ensure_ascii=False)[:800])
        txt = await detail.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,2000)")
        print("BODY:", txt.replace("\n"," | ")[:1400])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
