#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打开 AI 工单 WX2026102700498 详情页，定位 分派 按钮与责任人选择"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmO_"))
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
        # 捕获跳转到详情后的 URL
        navs = []
        page.on("framenavigated", lambda f: navs.append(f.url) if f == page.main_frame else None)
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('工作台')", timeout=90000)
        await page.wait_for_timeout(6000)

        # 在待办列表点开该工单
        print("点击工单行...")
        try:
            row = page.locator(f"tr:has-text('{TARGET}')").first
            await row.click(timeout=8000)
        except Exception as e:
            print("行点击失败:", e)
        await page.wait_for_timeout(6000)
        print("navs:", navs[-3:])
        print("当前URL:", page.url)
        await page.screenshot(path=str(OUT/"ai_detail_1.png"), full_page=False)

        # 列出页面上所有按钮文本
        btns = await page.evaluate("""() => Array.from(document.querySelectorAll('button,.ant-btn')).map(b=>{(b.innerText||'').trim()}).filter(Boolean)""")
        print("按钮:", json.dumps(list(dict.fromkeys(btns)), ensure_ascii=False)[:800])

        # 列出可见 input / 责任人 相关
        info = await page.evaluate("""() => {
            const r = {inputs:[], texts:[]};
            document.querySelectorAll('input,textarea,select').forEach(i=>{const b=i.getBoundingClientRect(); if(b.width>0) r.inputs.push({ph:i.placeholder||i.name||'', cls:(i.className||'').toString().slice(0,40), tag:i.tagName});});
            const all = (document.body.innerText||'').split('\\n').map(t=>t.trim()).filter(t=>t);
            r.texts = all.slice(0, 60);
            return r;
        }""")
        print("INPUTS:", json.dumps(info['inputs'], ensure_ascii=False)[:600])
        print("TEXTS:")
        for t in info['texts']:
            print("   ", t[:60])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
