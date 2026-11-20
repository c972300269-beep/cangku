import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("reports/tdoc"); OUT.mkdir(parents=True, exist_ok=True)
URL = "https://docs.qq.com/sheet/DTVVYcFZTTXZYUEt2"
DL = Path.home() / "Downloads"

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
            ignore_https_errors=True, viewport={"width":1600,"height":950},
            accept_downloads=True)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(10000)
        # 切到目标工作表
        b = await page.evaluate("""()=>{
            const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);let r=null;
            while(walk.nextNode()){const el=walk.currentNode;
              if(el.children.length===0&&el.textContent&&el.textContent.trim()==='10月16-31日'){r=el.getBoundingClientRect();}}
            return r?{x:r.x,y:r.y,w:r.width,h:r.height}:null;}""")
        if b:
            await page.mouse.click(b["x"]+b["w"]/2, b["y"]+b["h"]/2)
            await page.wait_for_timeout(4000)
            print("已切到 10月16-31日")
        # 打开左上主菜单
        menu = await page.evaluate("""()=>{
            const cands=[];
            document.querySelectorAll('div,span').forEach(el=>{
              if(el.children.length===0) return;
              const cls=(el.className||'').toString();
              if(/menu.*btn|btn.*menu|main-menu|title-bar-more/i.test(cls)) cands.push({cls:cls.slice(0,60), x:el.getBoundingClientRect().x, y:el.getBoundingClientRect().y, w:el.getBoundingClientRect().width});
            });
            return cands.slice(0,10);}""")
        print("菜单候选:", json.dumps(menu, ensure_ascii=False))
        # 直接试左上角图标坐标（工具栏最左的"三"）
        await page.mouse.click(30, 100)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(OUT/"menu_open.png"))
        # 找"导出"文本
        items = await page.evaluate("""()=>{
            const out=[];
            document.querySelectorAll('div,span,li').forEach(el=>{
              if(el.children.length===0){const t=(el.textContent||'').trim();
                if(/导出|下载|另存/.test(t)&&t.length<20){const r=el.getBoundingClientRect();
                  out.push({t, x:r.x,y:r.y,w:r.width,h:r.height});}}});
            return out.slice(0,15);}""")
        print("导出相关菜单项:", json.dumps(items, ensure_ascii=False))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
