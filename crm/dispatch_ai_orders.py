import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

NEW_ACCOUNT = "lvfeifan"
NEW_NAME = "吕飞凡"
NOTE = "请处理"
ACTION = "分派"

JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

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

        # 1) 取待办，筛 AI自动下单
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWorkOrderTaskList",
            {"pageIndex":1,"pageSize":50,"conditions":[]}, tok])
        j = json.loads(txt); data = j.get("data")
        rows = (data if isinstance(data, list) else (data.get("list") or data.get("rows") or []))
        ai = [r for r in rows if "AI自动下单" in (r.get("title") or r.get("Title") or "")]
        print("待办 AI自动下单 数:", len(ai))

        results = []
        for r in ai:
            serial = r.get("serialNum") or r.get("SerialNum")
            task_id = r.get("taskID") or r.get("TaskID")
            list_step = r.get("stepID") or r.get("StepID")
            # 2) 取详情（用列表 stepID，返回当前 stepID + fromData）
            st2, txt2 = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail",
                {"taskID": task_id, "stepID": list_step, "isProcess": True, "serialNum": serial}, tok])
            j2 = json.loads(txt2); dd = j2.get("data") or {}
            from_data = dd.get("fromData") or {}
            cur_step = dd.get("stepID")
            mi = from_data.get("Flow_ConsultationMainInfo") or {}
            print("\n=== %s ===" % serial)
            print("  approvalButton:", dd.get("approvalButton"), "| node:", dd.get("nodeName"), "| owner:", dd.get("ownerAccount"))
            print("  详情返回当前stepID:", cur_step, "| 嵌套Responsible:", mi.get("ResponsibleAccount"))

            # 3) 改派：Flow_ConsultationMainInfo 设处理人
            mi["ResponsibleAccount"] = NEW_ACCOUNT
            mi["ResponsibleName"] = NEW_NAME
            mi["Account"] = NEW_ACCOUNT
            # fromData 顶层也补（保险）
            from_data["ResponsibleAccount"] = NEW_ACCOUNT
            from_data["ResponsibleName"] = NEW_NAME
            from_data["Account"] = NEW_ACCOUNT

            body = {
                "taskID": task_id,
                "stepID": cur_step,
                "method": "Process",
                "comment": NOTE,
                "actionName": ACTION,
                "formData": from_data,
                "approvalType": "Default",
            }
            st3, txt3 = await page.evaluate(JS, [API + "/api/WorkOrder/ApprovalTask", body, tok])
            print("  提交 http", st3, "resp:", txt3[:300])

            await page.wait_for_timeout(2500)
            # 4) 复核：重新取详情（用原 list_step 或 cur_step 都行，详情会回当前）
            st4, txt4 = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail",
                {"taskID": task_id, "stepID": cur_step, "isProcess": True, "serialNum": serial}, tok])
            j4 = json.loads(txt4); dd4 = j4.get("data") or {}
            mi4 = (dd4.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
            ok = (mi4.get("ResponsibleAccount") == NEW_ACCOUNT)
            print("  复核 node=%s Responsible=%s -> %s" % (dd4.get("nodeName"), mi4.get("ResponsibleAccount"), "OK" if ok else "未变"))
            results.append((serial, ok, mi4.get("ResponsibleAccount")))

        print("\n========== 汇总 ==========")
        for serial, ok, ra in results:
            print("  %s -> %s (Responsible=%s)" % (serial, "已分派吕飞凡" if ok else "未变更", ra))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
