#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CRM 我的创建 / 服务追踪：找网格化体检、专项维修类工单"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CRM_BASE = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm_explore")
OUT.mkdir(parents=True, exist_ok=True)

ROW_JS = """() => {
  const rows = document.querySelectorAll('table tbody tr');
  const out = [];
  rows.forEach(r => {
    const cells = Array.from(r.querySelectorAll('td')).map(c => (c.innerText||'').replace(/\\s+/g,' ').trim());
    if (cells.length >= 3) out.push(cells);
  });
  return out;
}"""


async def dump(page, label, url, shot=None):
    print("\n" + "=" * 60)
    print(f"[{label}] {url}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(7000)
        if "login" in page.url.lower():
            print("  !! 登录失效")
            return []
        rows = await page.evaluate(ROW_JS)
        print(f"  行数: {len(rows)}")
        for r in rows[:40]:
            print("   ", " | ".join(r))
        if shot:
            await page.screenshot(path=str(OUT / shot), full_page=False)
        return rows
    except Exception as e:
        print("  ERR:", e)
        return []


async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_crm_"))
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
                        "Extensions", "Crashpad",
                    ), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except Exception:
                pass

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-gpu", "--window-size=1600,950"],
            ignore_https_errors=True, viewport={"width": 1600, "height": 950})
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(CRM_BASE, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(9000)

        await dump(page, "我的创建", f"{CRM_BASE}#/app/my-creation", "my_creation.png")
        await dump(page, "服务追踪", f"{CRM_BASE}#/app/service-trace", "service_trace.png")

        # 服务追踪页面上的所有输入框/按钮，便于后续精确查询
        info = await page.evaluate("""() => {
            const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
                ph: i.placeholder||'', cls: i.className, type: i.type
            }));
            const btns = Array.from(document.querySelectorAll('button')).map(b => (b.innerText||'').trim()).filter(Boolean);
            const labels = Array.from(document.querySelectorAll('label, .el-form-item__label')).map(l => (l.innerText||'').trim()).filter(Boolean);
            return {inputs, btns: Array.from(new Set(btns)), labels: Array.from(new Set(labels))};
        }""")
        print("\n=== 服务追踪 页面控件 ===")
        print(json.dumps(info, ensure_ascii=False, indent=1)[:3000])

        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
