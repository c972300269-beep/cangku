#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""最终确认：点击 serial 后原页是否弹出可派单的模态框"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmAB_"))
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
        async def on_popup(popup):
            await popup.close()
        ctx.on("page", on_popup)
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
        await page.wait_for_timeout(8000)

        # 全页文本，查找 分派/提交/保存/责任人
        txt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n')")
        for kw in ["分派","汇报完成","转派","提交","保存","处理","责任人"]:
            print(f"  含'{kw}':", kw in txt)
        # 找任何 modal/drawer/overlay
        ov = await page.evaluate("""() => {
            const sel='.ant-modal,.ant-drawer,.ant-modal-content,.ant-drawer-content,[class*=modal],[class*=Modal],[class*=drawer],[class*=Drawer]';
            const els=Array.from(document.querySelectorAll(sel)).filter(e=>e.offsetParent!==null);
            return els.map(e=>({cls:(e.className||'').toString().slice(0,50), t:(e.innerText||'').replace(/\\s+/g,' ').slice(0,80)}));
        }""")
        print("可见弹层:", json.dumps(ov, ensure_ascii=False)[:600])
        await page.screenshot(path=str(OUT/"final_modal.png"), full_page=True)
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
