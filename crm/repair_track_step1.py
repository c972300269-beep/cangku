#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""服务追踪 > 维修追踪：展开查询区 -> 单号搜索"""
import asyncio, shutil, tempfile, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)
caps = []


async def real_click(page, el):
    b = await el.bounding_box()
    if not b:
        return False
    await page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
    await page.wait_for_timeout(350)
    await page.mouse.down()
    await page.wait_for_timeout(120)
    await page.mouse.up()
    return True


async def click_by_text(page, txt):
    loc = page.get_by_text(txt, exact=True)
    for i in range(await loc.count()):
        el = loc.nth(i)
        try:
            if await el.is_visible():
                if await real_click(page, el):
                    return True
        except Exception:
            pass
    return False


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmE_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache",
                        "Service Worker", "IndexedDB", "blob_storage",
                        "File System", "shared_proto_db", "WebStorage",
                        "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-gpu"],
            ignore_https_errors=True, viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        page.on("request", lambda r: caps.append((r.method, r.url, (r.post_data or "")[:400]))
                if r.resource_type in ("xhr", "fetch") else None)

        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        try:
            await page.wait_for_function("() => (document.body.innerText||'').includes('工作台')", timeout=90000)
            print("[1] page ready")
        except Exception:
            print("[1] ready timeout, continue")

        await click_by_text(page, "服务追踪")
        await page.wait_for_timeout(2500)
        print("[2] 服务追踪 clicked")
        await page.screenshot(path=str(OUT / "r_1_svc.png"))

        ok = await click_by_text(page, "维修追踪")
        print("[3] 维修追踪 clicked:", ok)
        await page.wait_for_timeout(10000)
        print("    URL:", page.url)
        await page.screenshot(path=str(OUT / "r_2_repair.png"))
        bt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,2200)")
        print("    BODY:", bt.replace("\n", " | ")[:1300])

        # 右上角"展开"
        ex = await click_by_text(page, "展开")
        print("[4] 展开 clicked:", ex)
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(OUT / "r_3_expand.png"))

        info = await page.evaluate("""() => {
            const ins = Array.from(document.querySelectorAll('input')).filter(i=>i.offsetParent!==null)
              .map((i,idx)=>({idx, ph:i.placeholder||'', cls:(i.className||'').toString().slice(0,45),
                              val:i.value||'', x:Math.round(i.getBoundingClientRect().x), y:Math.round(i.getBoundingClientRect().y)}));
            const btns = Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent!==null)
              .map(b=>(b.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);
            const labels = Array.from(document.querySelectorAll('label,.ant-form-item-label')).map(l=>(l.innerText||'').trim()).filter(Boolean);
            return {inputs: ins.slice(0,25), buttons: Array.from(new Set(btns)).slice(0,25), labels: Array.from(new Set(labels)).slice(0,30)};
        }""")
        print("[5] INPUTS:", json.dumps(info["inputs"], ensure_ascii=False)[:1200])
        print("    BUTTONS:", json.dumps(info["buttons"], ensure_ascii=False)[:600])
        print("    LABELS:", json.dumps(info["labels"], ensure_ascii=False)[:600])

        print("--- xhr ---")
        seen = set()
        for m, u, b in caps:
            if "28091" in u:
                k = m + u.split("?")[0]
                if k in seen:
                    continue
                seen.add(k)
                print(f"  {m} {u[:130]}")
                if b:
                    print("      ", b[:250])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
