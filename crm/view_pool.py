#!/usr/bin/env python3
"""CRM 共享池工单查看（只读，不认领）"""
import asyncio, json, shutil, tempfile, sys
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright

CRM_URL = "https://times-crm.timesgroup.cn:28092/html/App.html#/app/shared-pool"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_profile_"))
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
            user_data_dir=str(temp_dir),
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
            ignore_https_errors=True,
            viewport={"width": 1440, "height": 900},
        )
        page = context.pages[0] if context.pages else await context.new_page()

        try:
            print(f"打开共享池: {CRM_URL}", flush=True)
            await page.goto(CRM_URL, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(5000)

            if "login" in page.url.lower():
                print("❌ Session过期，需要重新登录CRM", flush=True)
                return

            print("✓ 已登录共享池", flush=True)

            orders = await page.evaluate("""() => {
                const rows = document.querySelectorAll('table tbody tr');
                return Array.from(rows).map(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 7) {
                        return {
                            orderNo: cells[0].textContent.trim(),
                            category: cells[1].textContent.trim(),
                            title: cells[2].textContent.trim(),
                            nodeName: cells[3].textContent.trim(),
                            creator: cells[4].textContent.trim(),
                            startTime: cells[5].textContent.trim().replace(/\\s+/g, ' '),
                        };
                    }
                    return null;
                }).filter(o => o !== null && o.orderNo);
            }""")

            now = datetime.now()
            print(f"\n=== 共享池工单 ({now.strftime('%Y-%m-%d %H:%M:%S')}) ===")
            print(f"共 {len(orders)} 条\n")

            if not orders:
                print("📭 共享池暂无工单")
            else:
                for i, o in enumerate(orders, 1):
                    start = o.get("startTime", "")
                    try:
                        st = datetime.strptime(start, "%Y-%m-%d %H:%M:%S")
                        age = round((now - st).total_seconds() / 60, 1)
                    except:
                        age = "?"
                    print(f"{i}. {o['orderNo']}")
                    print(f"   标题: {o['title']}")
                    print(f"   类别: {o.get('category','')} | 节点: {o.get('nodeName','')}")
                    print(f"   发起: {start} | 已等待 {age} 分钟")
                    print()

            print(json.dumps({"count": len(orders), "orders": orders}, ensure_ascii=False), flush=True)

        except Exception as e:
            print(f"❌ 错误: {e}", flush=True)
            import traceback
            traceback.print_exc()
        finally:
            await context.close()

    shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
