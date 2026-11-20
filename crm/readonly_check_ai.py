import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
SERIALS = ["WX2026102800167", "WX2026102800033"]

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default", "Local State"]:
        s = CH / it; d = td / it
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db",
                        "WebStorage","Extensions","Crashpad"), dirs_exist_ok=True)
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
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(5000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        for SERIAL in SERIALS:
            # 从我的待办找 stepID
            st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWorkOrderTaskList",
                {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SERIAL}]}, tok])
            j = json.loads(txt); data = j.get("data")
            rows = (data if isinstance(data, list) else (data.get("list") if isinstance(data, dict) else []))
            if not rows:
                print("%s: 已不在我的待办（可能已流转/在池）" % SERIAL)
                continue
            r = rows[0]
            task_id = r.get("taskID"); step_id = r.get("stepID")
            st2, txt2 = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail",
                {"taskID": task_id, "stepID": step_id, "isProcess": True, "serialNum": SERIAL}, tok])
            dd = json.loads(txt2).get("data") or {}
            mi = (dd.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
            print("\n%s:" % SERIAL)
            print("  node:", dd.get("nodeName"), "| owner:", dd.get("ownerAccount"))
            print("  approvalButton:", dd.get("approvalButton"))
            print("  systemButton:", dd.get("systemButton"))
            print("  ResponsibleAccount:", mi.get("ResponsibleAccount"), "| ResponsibleName:", mi.get("ResponsibleName"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
