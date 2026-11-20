"""可见窗口登录 CRM：用户手动输入密码，登录成功后 token 保存在专用 profile，后续脚本免登录。"""
import asyncio, sys
from pathlib import Path
from playwright.async_api import async_playwright

PROFILE = Path.home() / ".workbuddy" / "crm_profile"
PROFILE.mkdir(parents=True, exist_ok=True)
WAIT_SEC = int(sys.argv[1]) if len(sys.argv) > 1 else 180

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=False, channel="chrome",
            args=["--no-sandbox", "--start-maximized"], ignore_https_errors=True,
            no_viewport=True)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/login",
                        wait_until="domcontentloaded", timeout=90000)
        print("WINDOW_OPEN：请在窗口中输入账号和密码登录", flush=True)
        ok = False
        for i in range(WAIT_SEC):
            await asyncio.sleep(1)
            try:
                tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
                url = page.url
            except Exception:
                continue
            if tok and "login" not in url.lower():
                print(f"LOGIN_OK after {i+1}s  token_len={len(tok)}  url={url}", flush=True)
                ok = True
                break
        if not ok:
            print("LOGIN_TIMEOUT 未检测到登录成功", flush=True)
        await asyncio.sleep(2)
        await ctx.close()
    print("DONE", flush=True)

asyncio.run(main())
