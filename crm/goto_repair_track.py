#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""稳健进入 服务追踪 > 维修追踪：等页面就绪 -> hover 展开 -> 读取子菜单/路由"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)
caps = []


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmD_"))
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
            print("page ready")
        except Exception as e:
            print("ready timeout:", str(e)[:80])
        await page.wait_for_timeout(4000)
        await page.screenshot(path=str(OUT / "svc_ready.png"))

        # 找"服务追踪"并 hover 展开
        loc = page.get_by_text("服务追踪", exact=True)
        print("服务追踪 count:", await loc.count())
        box = None
        for i in range(await loc.count()):
            el = loc.nth(i)
            try:
                if await el.is_visible():
                    box = await el.bounding_box()
                    if box:
                        break
            except Exception:
                pass
        print("box:", box)
        if box:
            x = box["x"] + box["width"] / 2
            y = box["y"] + box["height"] / 2
            await page.mouse.move(x, y)
            await page.wait_for_timeout(2500)
            await page.screenshot(path=str(OUT / "svc_hover.png"))
            # 展开后 dump 左菜单文本
            menu = await page.evaluate("""() => {
                const out = [];
                document.querySelectorAll('a,li,div,span').forEach(e => {
                    const t = (e.innerText||'').replace(/\\s+/g,' ').trim();
                    if (t && t.length <= 14 && e.offsetParent !== null && e.children.length === 0) {
                        out.push({t, tag: e.tagName, href: e.getAttribute('href')||'', cls:(e.className||'').toString().slice(0,40)});
                    }
                });
                return out.slice(0, 120);
            }""")
            print("=== 可见叶节点文本 ===")
            seen = set()
            for m in menu:
                if m["t"] in seen:
                    continue
                seen.add(m["t"])
                print(f"  {m['tag']} '{m['t']}' href={m['href']}")
            # 点维修追踪
            loc2 = page.get_by_text("维修追踪", exact=True)
            print("维修追踪 count:", await loc2.count())
            for i in range(await loc2.count()):
                el = loc2.nth(i)
                try:
                    if await el.is_visible():
                        b2 = await el.bounding_box()
                        if b2:
                            await page.mouse.move(b2["x"] + b2["width"] / 2, b2["y"] + b2["height"] / 2)
                            await page.wait_for_timeout(500)
                            await page.mouse.down()
                            await page.wait_for_timeout(120)
                            await page.mouse.up()
                            print("clicked 维修追踪")
                            break
                except Exception:
                    pass
            await page.wait_for_timeout(10000)
            print("URL now:", page.url)
            bt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,2000)")
            print("BODY:", bt.replace("\n", " | ")[:1200])
            await page.screenshot(path=str(OUT / "svc_repair.png"))
            seen2 = set()
            print("--- xhr ---")
            for m, u, b in caps:
                if "28091" in u:
                    k = m + u.split("?")[0]
                    if k in seen2:
                        continue
                    seen2.add(k)
                    print(f"  {m} {u[:120]}")
                    if b:
                        print("      ", b[:250])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
