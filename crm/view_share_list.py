import asyncio, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)

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
        ctx = await p.chromium.launch_persistent_context(user_data_dir=str(td), headless=True, args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"], ignore_https_errors=True, viewport={"width":1680,"height":1200})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        for i in range(30):
            await page.wait_for_timeout(2000)
            if await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length"):
                print("表格就绪 %ds" % ((i+1)*2)); break
        # 关通知
        await page.evaluate("()=>{[...document.querySelectorAll('.ant-notification-close-x, .ant-notification-notice-close')].forEach(x=>x.click())}")
        await page.wait_for_timeout(1000)
        # 点"共享池"tab
        tabs = await page.evaluate("()=>[...document.querySelectorAll('.ant-tabs-tab, .ant-radio-button-wrapper, .ant-segmented-item')].map(e=>e.innerText.trim())")
        print("tab列表:", tabs)
        clicked = False
        for t in await page.query_selector_all(".ant-tabs-tab, .ant-radio-button-wrapper"):
            try:
                if "共享池" in (await t.inner_text()):
                    await t.click(); clicked = True; print("已点共享池"); break
            except Exception:
                continue
        if not clicked:
            print("未找到共享池tab，尝试文本点击")
            el = await page.query_selector("text=共享池")
            if el:
                await el.click(); clicked = True
        await page.wait_for_timeout(4000)
        await page.screenshot(path=str(OUT/"p2_share.png"), full_page=True)
        # 提取表格文本
        rows = await page.evaluate("""()=>{
            return [...document.querySelectorAll('tr.ant-table-row')].map(r=>{
                return [...r.querySelectorAll('td')].map(td=>(td.innerText||'').replace(/\\s+/g,' ').trim()).join(' | ');
            });
        }""")
        print("\n=== 共享池表格 %d 行 ===" % len(rows))
        for i, r in enumerate(rows[:20], 1):
            print("%2d. %s" % (i, r[:260]))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
