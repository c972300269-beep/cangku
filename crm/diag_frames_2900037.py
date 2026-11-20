import asyncio, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
SERIAL = "WX2026102900037"

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default", "Local State"]:
        s = CH / it; d = td / it
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns("Cache","Code Cache","GPUCache","ShaderCache","Service Worker","IndexedDB","blob_storage","File System","shared_proto_db","WebStorage","Extensions","Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(user_data_dir=str(td), headless=True, args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"], ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        for i in range(20):
            await page.wait_for_timeout(2000)
            if await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length"):
                break
        await page.evaluate("()=>{const xs=[...document.querySelectorAll('.ant-notification-close-x, .ant-notification-notice-close')]; xs.forEach(x=>x.click());}")
        await page.wait_for_timeout(1000)
        link = None
        for a in await page.query_selector_all("a"):
            try:
                if (await a.inner_text()).strip() == SERIAL:
                    link = a; break
            except Exception:
                continue
        if not link:
            print("未找到单号链接"); await ctx.close(); return
        try:
            async with page.expect_popup(timeout=10000) as pi:
                await link.click()
            dp = await pi.value
            print("popup:", dp.url[:120])
        except Exception as e:
            print("popup失败:", e); await ctx.close(); return
        # 等表单加载
        await dp.wait_for_timeout(15000)
        # 遍历所有 frame
        for f in dp.frames:
            try:
                btns = await f.evaluate("()=>[...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(t=>t)")
                iframes = await f.evaluate("()=>[...document.querySelectorAll('iframe')].map(i=>i.src)")
                print("\n=== frame url=%s" % f.url[:100])
                print("  buttons:", btns[:20])
                print("  iframes:", iframes[:5])
            except Exception as e:
                print("\n=== frame %s 读取失败: %s" % (f.url[:60], type(e).__name__))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
