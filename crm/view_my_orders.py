#!/usr/bin/env python3
"""CRM 我的工单 + 共享池查看"""
import asyncio, json, shutil, tempfile
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright

CRM_BASE = "https://times-crm.timesgroup.cn:28092/html/App.html"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

async def check_page(page, url, label, extract_fn):
    print(f"\n{'='*50}")
    print(f"  [{label}] {url}")
    print(f"{'='*50}")
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(5000)
        
        if "login" in page.url.lower():
            print(f"  Session过期")
            return []
        
        orders = await page.evaluate(extract_fn)
        now = datetime.now()
        print(f"  共 {len(orders)} 条工单\n")
        
        for i, o in enumerate(orders, 1):
            start = o.get("startTime", "")
            try:
                st = datetime.strptime(start, "%Y-%m-%d %H:%M:%S")
                age = round((now - st).total_seconds() / 60, 1)
            except:
                age = "?"
            
            print(f"  {i}. [{o.get('orderNo','?')}] {o.get('title','')}")
            print(f"     类别: {o.get('category','')} | 节点: {o.get('nodeName','')}")
            print(f"     发起: {start} | 已等待 {age}分钟")
            print()
        
        return orders
    except Exception as e:
        print(f"  Error: {e}")
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
                        "Cache","Code Cache","GPUCache","ShaderCache",
                        "Service Worker","IndexedDB","blob_storage",
                        "File System","shared_proto_db","WebStorage",
                        "Extensions","Crashpad",
                    ), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except: pass

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir),
            headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu","--window-size=1440,900"],
            ignore_https_errors=True,
            viewport={"width":1440,"height":900},
        )
        page = context.pages[0] if context.pages else await context.new_page()

        # Shared pool first
        await check_page(page, 
            f"{CRM_BASE}#/app/shared-pool", "共享池",
            """() => {
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
                            startTime: cells[5].textContent.trim().replace(/\\s+/g,' '),
                        };
                    }
                    return null;
                }).filter(o => o && o.orderNo);
            }""")

        # My orders - try common paths
        my_paths = [
            ("#/app/my-tickets", "我的工单"),
            ("#/app/my-orders", "我的工单"),
            ("#/app/pending-order", "待处理工单"),
            ("#/app/pending-tickets", "待处理工单"),
            ("#/app/todo", "待办工单"),
            ("#/app/my-work", "我的工单"),
        ]
        
        for path, label in my_paths:
            orders = await check_page(page, f"{CRM_BASE}{path}", label,
                """() => {
                    const rows = document.querySelectorAll('table tbody tr, .list-item, .order-item');
                    const result = [];
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td, .cell, .col');
                        if (cells.length >= 2) {
                            result.push({
                                orderNo: cells[0].textContent.trim(),
                                title: cells.length > 1 ? cells[1].textContent.trim() : '',
                                category: cells.length > 2 ? cells[2].textContent.trim() : '',
                                nodeName: cells.length > 3 ? cells[3].textContent.trim() : '',
                                creator: cells.length > 4 ? cells[4].textContent.trim() : '',
                                startTime: cells.length > 5 ? cells[5].textContent.trim().replace(/\\s+/g,' ') : '',
                            });
                        }
                    });
                    return result.filter(o => o.orderNo && o.orderNo.length > 2);
                }""")
            if len(orders) > 0:
                break  # found the right page

        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
