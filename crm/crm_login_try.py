import asyncio, shutil, tempfile, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm_login"); OUT.mkdir(parents=True, exist_ok=True)
ACC = sys.argv[1] if len(sys.argv) > 1 else "chenjialin3"
PWD = sys.argv[2] if len(sys.argv) > 2 else "__REDACTED_SECRET__"
JOB = sys.argv[3] if len(sys.argv) > 3 else "400"

async def main():
    # 固定专用profile：登录一次，token 持久保存
    td = Path.home() / ".workbuddy" / "crm_profile"
    td.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True, channel="chrome",
            args=["--no-sandbox","--disable-gpu"], ignore_https_errors=True,
            viewport={"width":1440,"height":900})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/login", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        # 关闭 JWT expired 提示
        try:
            await page.click("text=知道了", timeout=3000)
            await page.wait_for_timeout(1000)
        except Exception: pass
        await page.fill("#account", ACC)
        await page.fill("#pwd", PWD)
        # 400工号(#job)不填，留空
        await page.wait_for_timeout(500)
        await page.click("text=登录")
        await page.wait_for_timeout(8000)
        print("URL:", page.url)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("TOKEN_LEN:", len(tok))
        body = await page.evaluate("()=>document.body.innerText.slice(0,300)")
        print("BODY:", body.replace("\n", " | "))
        await page.screenshot(path=str(OUT / "login_result.png"))
        await ctx.close()
    # 保留 profile，下次免登录（不删除 td）

asyncio.run(main())
