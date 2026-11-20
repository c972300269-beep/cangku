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
        # 枚举底部工作表标签
        tabs = await page.evaluate("""()=>{
            const out=[];
            document.querySelectorAll('div,span').forEach(el=>{
              if(el.children.length===0){
                const t=(el.textContent||'').trim();
                const r=el.getBoundingClientRect();
                if(t && t.length<20 && r.y>880 && r.width>0 && r.height>0 && r.x<500)
                  out.push({t, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)});
              }});
            return out;}""")
        print("底部标签候选:", json.dumps(tabs, ensure_ascii=False, indent=1))
        # 点击第2个标签
        if len(tabs) >= 2:
            b = tabs[1]
            await page.mouse.click(b["x"]+b["w"]/2, b["y"]+b["h"]/2)
            await page.wait_for_timeout(5000)
            print("已点击第2个标签:", b["t"])
        await page.keyboard.press("Control+Home")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(OUT/"tab2_open.png"))
        # 登录态检查
        cookies = await ctx.cookies(["https://docs.qq.com"])
        names = [c["name"] for c in cookies]
        print("cookie数量:", len(cookies), "| 关键:", [n for n in names if any(k in n.lower() for k in ("uid","uin","ticket","session","p_skey","p_uid"))])
        info = await page.evaluate("()=>({hasLoginBtn: document.body.innerText.includes('登录腾讯文档'), head: document.body.innerText.slice(0,150)})")
        print(json.dumps(info, ensure_ascii=False))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
