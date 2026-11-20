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
        b = await page.evaluate("""()=>{
            const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);let r=null;
            while(walk.nextNode()){const el=walk.currentNode;
              if(el.children.length===0&&el.textContent&&el.textContent.trim()==='10月16-31日'){r=el.getBoundingClientRect();}}
            return r?{x:r.x,y:r.y,w:r.width,h:r.height}:null;}""")
        if b:
            await page.mouse.click(b["x"]+b["w"]/2, b["y"]+b["h"]/2)
            await page.wait_for_timeout(4000)
        await page.mouse.click(933, 283)
        await page.wait_for_timeout(2000)
        # 面板列表滚动到底（列表区域约 x 940-1200, y 390-790）
        for i in range(6):
            await page.mouse.move(1050, 600)
            await page.mouse.wheel(0, 400)
            await page.wait_for_timeout(500)
        await page.screenshot(path=str(OUT/"filter7.png"))
        # 不点确定/取消，直接关浏览器（不改筛选）
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
