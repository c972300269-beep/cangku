#!/usr/bin/env python3
"""CRM: 快速检查所有工单相关页面"""
import asyncio, json, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

CRM = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

async def main():
    td = Path(tempfile.mkdtemp(prefix="crm_"))
    for item in ["Default","Local State"]:
        s = CHROME / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db",
                        "WebStorage","Extensions","Crashpad"), dirs_exist_ok=True)
                else: shutil.copy2(s, d)
            except: pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1440,"height":900})
        pg = ctx.pages[0] if ctx.pages else await ctx.new_page()

        pages = [
            ("共享池", "#/app/shared-pool"),
            ("我的待办", "#/app/my-todo"),
            ("我的已办", "#/app/my-done"),
            ("我的创建", "#/app/my-created"),
            ("草稿箱", "#/app/draft"),
            ("工作台", "#/app/workbench"),
        ]

        print("=== CRM 工单/待办页面检查 ===\n")
        for name, path in pages:
            try:
                url = CRM + path
                await pg.goto(url, wait_until="domcontentloaded", timeout=20000)
                await pg.wait_for_timeout(4000)
                
                body = await pg.evaluate("() => document.body ? document.body.innerText.substring(0, 800) : 'EMPTY'")
                
                if '403' in body or '无权' in body:
                    print(f"[{name}] {path}")
                    print(f"  状态: 无权限访问\n")
                    continue
                
                rows = await pg.evaluate("""() => {
                    const trs = document.querySelectorAll('table tbody tr, .el-table__body tr');
                    return Array.from(trs).map(r => {
                        return Array.from(r.querySelectorAll('td, .el-table__cell'))
                            .map(c => c.textContent.trim().substring(0,60));
                    }).filter(r => r.length > 1);
                }""")
                
                real = [r for r in rows if not any('暂无数据' in c for c in r)]
                print(f"[{name}] {path} -> {len(real)}条")
                for r in real[:10]:
                    print(f"  {r}")
                if not real:
                    print(f"  (空)")
                print()
                    
            except Exception as e:
                print(f"[{name}] {path} -> Error: {e}\n")

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
