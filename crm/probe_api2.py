#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在已登录的 CRM 页面上下文里试调候选接口，找出能按工单号查询的接口"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091/api"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
SERIAL = "WX2026091400235"

CANDIDATES = [
    ("/BPMTask/GetCRMCreateList", {"serialNum": SERIAL, "processName": "", "description": "", "pageIndex": 1, "pageSize": 10}),
    ("/BPMTask/GetCRMTaskList", {"serialNum": SERIAL, "processName": "", "description": "", "pageIndex": 1, "pageSize": 10}),
    ("/WorkOrder/GetWorkOrderList", {"serialNum": SERIAL, "pageIndex": 1, "pageSize": 10}),
    ("/Workflow/GetWorkflowList", {"serialNum": SERIAL, "pageIndex": 1, "pageSize": 10}),
    ("/BPMTask/GetCRMList", {"serialNum": SERIAL, "pageIndex": 1, "pageSize": 10}),
]


async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_crm2_"))
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
        await page.wait_for_timeout(25000)
        print("URL:", page.url)
        bt = await page.evaluate("() => (document.body.innerText||'').slice(0,1200)")
        print("BODY:", bt.replace("\n", " | ")[:900])
        await page.screenshot(path=str(OUT / "wb_2.png"))

        # 从 localStorage / cookie 找 token 头
        tk = await page.evaluate("""() => {
            const o = {};
            for (let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').slice(0,80);}
            return o;
        }""")
        print("=== localStorage keys ===")
        for k, v in list(tk.items())[:20]:
            print(f"  {k} = {v}")

        for path, body in CANDIDATES:
            js = """async ([url, body]) => {
                try {
                    const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify(body), credentials:'include'});
                    const t = await r.text();
                    return r.status + ' :: ' + t.slice(0, 700);
                } catch(e) { return 'ERR ' + e.message; }
            }"""
            res = await page.evaluate(js, [API + path, body])
            print("\n" + "=" * 70)
            print(path)
            print("  ", res[:700].replace("\n", " "))
        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
