#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""关闭弹窗并点击行内标题，尝试在原页弹出带分派的详情模态框"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmAA_"))
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
        # 立即关闭任何 popup（新标签）
        async def on_popup(popup):
            print("popup detected, closing:", popup.url)
            await popup.close()
        ctx.on("page", on_popup)
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(5000)

        # 点击行内标题 span（避开 serial <a>）
        box = await page.evaluate("""(target) => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const r of rows) {
                if (r.textContent.includes(target)) {
                    const span = r.querySelector('td:nth-child(3) span');
                    const b = (span||r).getBoundingClientRect();
                    return {x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2)};
                }
            }
            return null;
        }""", TARGET)
        print("title cell center:", box)
        if box:
            await page.mouse.move(box["x"], box["y"])
            await page.wait_for_timeout(300)
            await page.mouse.down(); await page.mouse.up()
            await page.wait_for_timeout(6000)
        # 检查原页是否有 分派 模态框
        fen = await page.evaluate("""() => Array.from(document.querySelectorAll('*')).filter(e=>{const t=(e.innerText||'').trim(); return t==='分派'||t==='汇报完成'||t==='转派';}).map(e=>{const b=e.getBoundingClientRect(); return {t:t, x:Math.round(b.x), y:Math.round(b.y), vis:b.width>0&&b.height>0};})""")
        print("原页动作按钮:", json.dumps(fen, ensure_ascii=False))
        modal = await page.evaluate("""() => { const m=document.querySelector('.ant-modal-content,.ant-drawer-content'); return m? (m.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,600):'NO MODAL'; }""")
        print("MODAL:", modal.replace("\n"," | ")[:400] if isinstance(modal,str) else modal)
        await page.screenshot(path=str(OUT/"modal2.png"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
