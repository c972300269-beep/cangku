import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default", "Local State"]:
        s = CH / it; d = td / it
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db",
                        "WebStorage","Extensions","Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception: pass
    captured = []
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        async def on_response(r):
            u = r.url
            if "/api/" in u and r.request.method in ("POST","GET"):
                try:
                    body = await r.text()
                except Exception:
                    body = ""
                captured.append((r.request.method, u, body))
        page.on("response", on_response)

        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("()=>document.body.innerText.includes('工作台')", timeout=90000)
        await page.wait_for_timeout(4000)

        async def click_menu(text):
            loc = page.get_by_text(text, exact=True)
            for i in range(await loc.count()):
                el = loc.nth(i)
                try:
                    if await el.is_visible():
                        await el.click()
                        await page.wait_for_timeout(3500)
                        return True
                except Exception:
                    pass
            return False

        for m in ["我的待办", "我的已办", "我的创建", "工单池"]:
            print("\n##### 点击菜单:", m, "#####")
            ok = await click_menu(m)
            # 检查页面 body 是否含目标单号
            bt = await page.evaluate("()=>document.body.innerText")
            for t in ["WX2026102800167", "WX2026102800033"]:
                if t in bt:
                    print("  页面文本命中 %s" % t)
            # 检查捕获的响应里是否含目标单号，打印命中的接口与 taskID
            for method, u, body in captured:
                if "WX2026102800167" in body or "WX2026102800033" in body:
                    # 尝试提取 taskID
                    try:
                        j = json.loads(body)
                        def walk(o, acc):
                            if isinstance(o, dict):
                                for k,v in o.items():
                                    if k.lower() in ("taskid","serialnum","serial") and ("WX20261028" in str(v) or isinstance(v,(int,))):
                                        acc.append((k,v))
                                    walk(v, acc)
                            elif isinstance(o, list):
                                for x in o: walk(x, acc)
                        acc=[]
                        walk(j, acc)
                        print("  响应命中 %s | %s | 提取=%s | url=%s" % (
                            "WX2026102800167" if "WX2026102800167" in body else "WX2026102800033",
                            method, acc[:6], u.split("28091")[-1][:80]))
                    except Exception:
                        print("  响应命中(非json) url=%s len=%d" % (u.split("28091")[-1][:80], len(body)))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
