#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""点击 AI 工单行，捕获详情跳转与接口，列出可操作按钮"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
TARGET = "WX2026102700498"

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmP_"))
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
        page.on("request", lambda r: xhrs.append((r.method, r.url, (r.post_data or "")[:200])) if r.resource_type in ("xhr","fetch") else None)
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('工作台')", timeout=90000)
        await page.wait_for_timeout(6000)

        # 找到包含 TARGET 的行，点击其 标题 单元格内的链接/文本
        row = page.locator(f"tr:has-text('{TARGET}')").first
        # 先尝试点击该行里 a 标签（单号/标题常是链接）
        link = row.locator("a").first
        n_links = await row.locator("a").count()
        print("行内链接数:", n_links)
        try:
            if n_links > 0:
                await link.click(timeout=6000)
            else:
                await row.click(timeout=6000)
        except Exception as e:
            print("点击异常:", e)
        await page.wait_for_timeout(7000)
        print("URL after click:", page.url)

        # 捕获详情接口
        print("=== 详情相关 XHR ===")
        seen = set()
        for m, u, b in xhrs:
            if "28091" in u:
                k = m + " " + u.split("?")[0]
                if k in seen:
                    continue
                seen.add(k)
                print(f"  {m} {u[:130]}")
                if b:
                    print("      ", b[:160])

        # 找 分派 按钮
        btns = await page.evaluate("""() => Array.from(document.querySelectorAll('button,.ant-btn,span,div,a')).map(e=>({t:(e.innerText||'').trim(),cls:(e.className||'').toString().slice(0,30)})).filter(x=>x.t && (x.t==='分派'||x.t==='转派'||x.t==='处理'||x.t==='获取处理权'||x.t==='接单'))""")
        print("动作元素:", json.dumps(btns, ensure_ascii=False)[:600])

        await page.screenshot(path=str(OUT/"ai_click.png"), full_page=False)
        # 详情页文本
        txt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,1500)")
        print("BODY:", txt.replace("\n"," | ")[:900])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
