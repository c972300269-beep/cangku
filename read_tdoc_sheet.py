#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按精确项目名搜索在线表，返回匹配数并截图"""
import asyncio, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://docs.qq.com/sheet/DRWFQUWd6bW1mSmtX?tab=BB08J2"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/tdoc")
OUT.mkdir(parents=True, exist_ok=True)

KWS = [
    "香海彼岸（清远）一期",
    "香海彼岸（清远）二期北区",
    "香海彼岸（清远）二期",
    "龙湖苑（清远）",
    "雅悦花园（清远）",
]


async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_tdoc_"))
    for item in ["Default", "Local State"]:
        src = CHROME_USER_DATA / item
        dst = temp_dir / item
        if src.exists():
            try:
                if src.is_dir():
                    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache",
                        "Service Worker", "IndexedDB", "blob_storage",
                        "File System", "shared_proto_db", "WebStorage",
                        "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except Exception:
                pass

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-gpu", "--window-size=1680,1000"],
            ignore_https_errors=True, viewport={"width": 1680, "height": 1000})
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(18000)
        await page.mouse.click(600, 400)
        await page.wait_for_timeout(1200)

        for i, kw in enumerate(KWS):
            try:
                await page.keyboard.press("Control+f")
                await page.wait_for_timeout(2200)
                await page.evaluate("""() => {
                    const vis = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null);
                    if (vis.length) { const t = vis[vis.length-1]; t.focus(); t.value=''; }
                }""")
                await page.keyboard.type(kw, delay=50)
                await page.wait_for_timeout(3500)
                cnt = await page.evaluate("""() => {
                    const out = [];
                    document.querySelectorAll('[class*="find"],[class*="search"]').forEach(e => {
                        const t = (e.innerText||'').replace(/\\s+/g,' ').trim();
                        if (t && t.length < 60) out.push(t);
                    });
                    return out.join(' | ');
                }""")
                print(f"[{kw}] -> {cnt[:120]}")
                await page.screenshot(path=str(OUT / f"exact_{i}.png"))
                # 再按 Enter 跳到下一个匹配看下一处
                for step in range(1, 4):
                    await page.keyboard.press("Enter")
                    await page.wait_for_timeout(2200)
                    await page.screenshot(path=str(OUT / f"exact_{i}_{step}.png"))
                await page.keyboard.press("Escape")
                await page.wait_for_timeout(1000)
            except Exception as e:
                print(f"[{kw}] err: {e}")

        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
