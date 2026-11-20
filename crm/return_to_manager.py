import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
API  = "https://crm.linli580.cn:28091"
SERIAL = "WX2026102700498"
TASK_ID = 7853065
# 当前步骤（责任人(物业)）从最近一次详情取得
STEP_ID = 75888358

JS = """async ([url,body,tok])=>{
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});
    return [r.status, await r.text()];
  }catch(e){return [-1,'ERR '+e.message];}
}"""

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default","Local State"]:
        s = Path.home()/"AppData"/"Local"/"Google"/"Chrome"/"User Data"/it
        d = td/it
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s,d,ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db",
                        "WebStorage","Extensions","Crashpad"),dirs_exist_ok=True)
                else:
                    shutil.copy2(s,d)
            except Exception:
                pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("()=>(document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(3000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        # 1) 拉当前详情，拿项目/期区编码 + 完整 fromData
        st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
            {"taskID":TASK_ID,"stepID":STEP_ID,"isProcess":True,"serialNum":SERIAL}, tok])
        j = json.loads(txt); d = j.get("data") or {}
        mi = d.get("fromData",{}).get("Flow_ConsultationMainInfo",{})
        project_code = mi.get("ProjectCode") or ""
        period_code  = mi.get("PeriodCode") or ""
        area_id      = mi.get("AreaID") or ""
        print("项目编码:", project_code, "| 期区编码:", period_code, "| AreaID:", area_id)
        print("当前节点:", d.get("nodeName"), "| 当前持有人:", d.get("ownerAccount"))

        # 2) 查工程主管（Engineering_Director = 5）
        st2, txt2 = await page.evaluate(JS, [API+"/api/AreaInfo/GetAreaRoleInfo",
            {"areaID":area_id,"blockMainCode":period_code,"projectMainCode":project_code,"roleTypes":[5]}, tok])
        try:
            rj = json.loads(txt2)
            print("GetAreaRoleInfo http", st2, "success", rj.get("success"))
            data = rj.get("data") or []
            if isinstance(data, list):
                for x in data:
                    print("  主管:", x.get("empName"), x.get("userAccount"), x.get("roleName"))
            else:
                print("  data:", json.dumps(data, ensure_ascii=False)[:400])
        except Exception as e:
            print("  解析主管失败:", e, txt2[:200])

        # 3) 提交 返回至主管
        from_data = d.get("fromData", {})
        # 预填 NextResponsibleName（若上一步拿到主管名）
        if isinstance(data, list) and data:
            from_data["NextResponsibleName"] = data[0].get("empName")
            from_data["NextResponsibleAccount"] = data[0].get("userAccount")

        submit = {
            "taskID": TASK_ID,
            "stepID": STEP_ID,
            "method": "Process",
            "comment": "申请返回至工程主管，由主管重新分派至工程技工吕飞凡跟进处理",
            "actionName": "返回至主管",
            "formData": from_data,
            "approvalType": "Default",
        }
        st3, txt3 = await page.evaluate(JS, [API+"/api/WorkOrder/ApprovalTask", submit, tok])
        print("\n=== 返回至主管 提交 ===")
        print("http", st3)
        print("resp:", txt3[:500])

        await page.wait_for_timeout(2000)
        # 4) 复核
        st4, txt4 = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
            {"taskID":TASK_ID,"stepID":STEP_ID,"isProcess":True,"serialNum":SERIAL}, tok])
        try:
            j4 = json.loads(txt4); d4 = j4.get("data") or {}
            mi4 = d4.get("fromData",{}).get("Flow_ConsultationMainInfo",{})
            print("\n=== 复核 ===")
            print("success", j4.get("success"))
            print("nodeName:", d4.get("nodeName"))
            print("ownerAccount:", d4.get("ownerAccount"), "ownerName:", d4.get("ownerName"))
            print("approvalButton:", d4.get("approvalButton"))
            print("ResponsibleAccount:", mi4.get("ResponsibleAccount"), "ResponsibleName:", mi4.get("ResponsibleName"))
        except Exception as e:
            print("复核解析失败:", e, txt4[:300])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
