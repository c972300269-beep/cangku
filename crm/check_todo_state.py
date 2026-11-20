#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查 WX2026102700498 当前在 chenjialin3 待办/共享池/已办 中的状态，定位真实当前步骤。"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
SERIAL = "WX2026102700498"

JS = """async ([url, body, tok]) => {
    try {
        const r = await fetch(url, {method:'POST',
            headers:{'Content-Type':'application/json','authorization':tok},
            body: JSON.stringify(body)});
        return [r.status, await r.text()];
    } catch(e) { return [-1, 'ERR ' + e.message]; }
}"""

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmW_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db","WebStorage",
                        "Extensions","Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(3000)
        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        for name, ep, body in [
            ("我的待办 GetWorkOrderTaskList", "/api/WorkOrder/GetWorkOrderTaskList",
             {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SERIAL}]}),
            ("共享池 GetShareTaskList", "/api/WorkOrder/GetShareTaskList",
             {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SERIAL}]}),
            ("我的已办/历史", "/api/WorkOrder/GetMyApprovalTaskList",
             {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SERIAL}]}),
        ]:
            st, txt = await page.evaluate(JS, [API+ep, body, tok])
            try:
                j = json.loads(txt)
                rows = (j.get("data") or {}).get("list") or (j.get("data") or {}).get("rows") or j.get("data") or []
                print(f"\n== {name} http {st} total {(j.get('data') or {}).get('total')} ==")
                if isinstance(rows, list):
                    for r in rows[:10]:
                        # 打印关键字段
                        keys = ["SerialNum","Title","NodeName","StepID","OwnerAccount","OwnerName","ResponsibleAccount","ResponsibleName","Status","State"]
                        info = {k:r.get(k) for k in keys if k in r}
                        print("  ", info)
                else:
                    print("  data type:", type(rows))
            except Exception as e:
                print(f"\n== {name} http {st} parse err =="); print(txt[:300])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
