#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打开腾讯文档在线表 -> 全选复制 -> 读剪贴板 TSV -> 保存并筛选本项目行"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://docs.qq.com/sheet/DRWFQUWd6bW1mSmtX?tab=BB08J2"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/tdoc")
OUT.mkdir(parents=True, exist_ok=True)

TARGETS = [
    "时代香海彼岸（清远）一期",
    "时代香海彼岸(清远)一期",
    "香海彼岸（清远）一期",
    "时代香海彼岸（清远）二期北区",
    "时代香海彼岸(清远)二期北区",
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
        try:
            await context.grant_permissions(["clipboard-read", "clipboard-write"],
                                            origin="https://docs.qq.com")
        except Exception as e:
            print("grant perm err:", e)

        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(20000)
        print("title:", await page.title())
        await page.screenshot(path=str(OUT / "copy_0_open.png"))

        # 装 copy 捕获器
        await page.evaluate("""() => {
            window.__cp = '';
            document.addEventListener('copy', (e) => {
                try {
                    const d = e.clipboardData || window.clipboardData;
                    window.__cp = d.getData('text/plain') || d.getData('text') || '';
                } catch (err) { window.__cp = '__ERR__' + err.message; }
            }, true);
        }""")

        # 点进表格区域后全选复制
        await page.mouse.click(700, 430)
        await page.wait_for_timeout(1500)
        for attempt in range(3):
            await page.keyboard.press("Control+a")
            await page.wait_for_timeout(2500)
            await page.keyboard.press("Control+c")
            await page.wait_for_timeout(6000)
            txt = await page.evaluate("() => window.__cp || ''")
            if not txt:
                try:
                    txt = await page.evaluate("() => navigator.clipboard.readText()")
                except Exception as e:
                    print("readText err:", e)
            print(f"attempt {attempt}: len={len(txt) if txt else 0}")
            if txt and len(txt) > 200:
                (OUT / "sheet_copy.txt").write_text(txt, encoding="utf-8")
                break
            await page.wait_for_timeout(2000)

        await page.screenshot(path=str(OUT / "copy_9_end.png"))
        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
