import asyncio, shutil, tempfile, json
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
        vp = page.viewport_size
        print("viewport:", vp)
        # 找底部所有含"10月16-31日"的元素及其位置
        boxes = await page.evaluate("""()=>{
            const out=[];
            const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);
            while(walk.nextNode()){
              const el=walk.currentNode;
              if(el.children.length===0 && el.textContent && el.textContent.trim()==='10月16-31日'){
                const r=el.getBoundingClientRect();
                out.push({tag:el.tagName, cls:(el.className||'').toString().slice(0,60), x:r.x,y:r.y,w:r.width,h:r.height});
              }
            }
            return out;}""")
        print(json.dumps(boxes, ensure_ascii=False, indent=1))
        if boxes:
            b = boxes[-1]
            cx = b["x"]+b["w"]/2; cy = b["y"]+b["h"]/2
            await page.mouse.click(cx, cy)
            await page.wait_for_timeout(5000)
            print("clicked at", cx, cy)
        await page.keyboard.press("Control+Home")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(OUT/"tab4.png"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
