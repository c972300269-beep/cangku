#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""真实鼠标点击 AI 工单行，等待详情弹窗，列出动作按钮"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmU_"))
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
        new_pages = []
        ctx.on("page", lambda pg: new_pages.append(pg))
        xhrs = []
        page.on("request", lambda r: xhrs.append((r.method, r.url)) if r.resource_type in ("xhr","fetch") else None)
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(5000)

        # 真实鼠标点击 serial 单元格
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
        print("serial cell center:", box)
        if box:
            await page.mouse.move(box["x"], box["y"])
            await page.wait_for_timeout(300)
            await page.mouse.down(); await page.mouse.up()
            await page.wait_for_timeout(5000)

        print("URL:", page.url, "| new pages:", len(new_pages))
        has_detail = "GetWokerOrderDetail" in str(xhrs)
        print("detail API called:", has_detail)
        # 找 分派/处理 按钮
        btns = await page.evaluate("""() => Array.from(document.querySelectorAll('button,.ant-btn')).map(b=>(b.innerText||'').trim()).filter(Boolean)""")
        print("按钮:", json.dumps(list(dict.fromkeys(btns)), ensure_ascii=False)[:600])
        # 是否出现 modal
        modal = await page.evaluate("""() => {
            const m = document.querySelector('.ant-modal,.ant-drawer,.ant-modal-content');
            if(!m) return 'NO MODAL';
            return (m.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,800);
        }""")
        print("MODAL:", modal.replace("\n"," | ")[:600] if isinstance(modal,str) else modal)
        await page.screenshot(path=str(OUT/"modal_try.png"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
