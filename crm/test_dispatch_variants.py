import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
SERIAL = "WX2026102800033"; TASK = 7853801; STEP = 75892949

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
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail",
            {"taskID": TASK, "stepID": STEP, "isProcess": True, "serialNum": SERIAL}, tok])
        dd = json.loads(txt).get("data") or {}
        from_data = json.loads(json.dumps(dd.get("fromData") or {}))  # deep copy
        mi = from_data.get("Flow_ConsultationMainInfo") or {}

        def submit(fd):
            body = {"taskID": TASK, "stepID": dd.get("stepID"), "method": "Process",
                    "comment": "请处理", "actionName": "分派", "formData": fd, "approvalType": "Default"}
            return page.evaluate(JS, [API + "/api/WorkOrder/ApprovalTask", body, tok])

        # 变体A：原样完整 fromData（不加任何键）
        stA, txtA = await submit(from_data)
        print("【A 原样完整fromData】http", stA, "msg:", txtA[:200])

        # 变体B：只改 Flow_ConsultationMainInfo（不加顶层）
        from_data2 = json.loads(json.dumps(dd.get("fromData") or {}))
        mi2 = from_data2["Flow_ConsultationMainInfo"]
        mi2["ResponsibleAccount"] = "lvfeifan"
        mi2["ResponsibleName"] = "吕飞凡"
        mi2["Account"] = "lvfeifan"
        stB, txtB = await submit(from_data2)
        print("【B 只改嵌套Flow_ConsultationMainInfo】http", stB, "msg:", txtB[:200])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
