import asyncio, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("reports/tdoc"); OUT.mkdir(parents=True, exist_ok=True)
URL = "https://docs.qq.com/sheet/DTVVYcFZTTXZYUEt2"

async def main():
    td = Path(tempfile.mkdtemp(prefix="td_"))
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
            except Exception:
                pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=False, channel="chrome",
            args=["--disable-blink-features=AutomationControlled","--no-sandbox"],
            ignore_https_errors=True, viewport={"width":1600,"height":950})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(10000)
        # 点击 "10月16-31日" 标签
        tab = page.locator("text=10月16-31日").first
        try:
            await tab.click(); await page.wait_for_timeout(5000)
            print("已点击 10月16-31日 标签")
        except Exception as e:
            print("点击标签失败:", e)
        await page.screenshot(path=str(OUT/"tab2.png"))
        # 打开左上主菜单(三条杠)找导出
        try:
            menu = page.locator(".menu-btn, .main-menu-btn, [class*='menu']").first
            await page.keyboard.press("Alt+F")  # 试快捷键
            await page.wait_for_timeout(2000)
            await page.screenshot(path=str(OUT/"menu1.png"))
        except Exception as e:
            print("alt+F失败", e)
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
