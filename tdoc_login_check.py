import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
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
        cookies = await ctx.cookies(["https://docs.qq.com"])
        names = [c["name"] for c in cookies]
        print("cookie数量:", len(cookies))
        print("关键cookie:", [n for n in names if any(k in n.lower() for k in ("uid","uin","ticket","session","login","p_skey","p_uid"))])
        info = await page.evaluate("""()=>{
            const t=document.body.innerText;
            return {
              hasLoginBtn: t.includes('登录腾讯文档'),
              hasRecordBtn: t.includes('录制')||t.includes('分享'),
              head: t.slice(0,200)
            };}""")
        print(json.dumps(info, ensure_ascii=False, indent=1))
        # 尝试进入编辑态测试：双击一个空白远端单元格 O100
        await page.mouse.click(1450, 700)
        await page.wait_for_timeout(500)
        await page.keyboard.press("Control+Home")
        await page.wait_for_timeout(500)
        # 选中A1后直接输入字符看是否出现编辑框
        await page.keyboard.type("TEST")
        await page.wait_for_timeout(1200)
        await page.screenshot(path=str(Path("reports/tdoc")/"edit_test.png"))
        await page.keyboard.press("Escape")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
