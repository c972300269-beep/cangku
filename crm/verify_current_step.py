import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API   = "https://crm.linli580.cn:28091"
CH    = Path.home()/"AppData"/"Local"/"Google"/"Chrome"/"User Data"
SERIAL = "WX2026102700498"

JS = """async ([url,body,tok])=>{
  try{ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)}); return [r.status,await r.text()]; }
  catch(e){ return [-1,'ERR '+e.message]; }
}"""

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default","Local State"]:
        s = CH/it; d = td/it
        if s.exists():
            try:
                if s.is_dir(): shutil.copytree(s,d,ignore=shutil.ignore_patterns("Cache","Code Cache","GPUCache","ShaderCache","Service Worker","IndexedDB","blob_storage","File System","shared_proto_db","WebStorage","Extensions","Crashpad"),dirs_exist_ok=True)
                else: shutil.copy2(s,d)
            except Exception: pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        # 我的待办列表
        st,txt = await page.evaluate(JS,[API+"/api/WorkOrder/GetWorkOrderTaskList",{"pageIndex":1,"pageSize":50},tok])
        j=json.loads(txt)
        d0 = j.get("data")
        if isinstance(d0, list):
            rows = d0
            total = len(d0)
        elif isinstance(d0, dict):
            rows = d0.get("list") or d0.get("rows") or []
            total = d0.get("total")
        else:
            rows = []; total = None
        print("http",st,"total",total,"rows",len(rows))
        found=None
        for r in rows:
            blob=json.dumps(r,ensure_ascii=False)
            if SERIAL in blob:
                found=r; break
        if found:
            print("=== 待办命中行 ===")
            print(json.dumps(found, ensure_ascii=False, indent=1))
        else:
            print("待办中未命中，打印前3行字段名:", [list(r.keys()) for r in rows[:3]] if rows else "空")

        # 用命中行的 stepID 调详情
        if found:
            step = found.get("stepID") or found.get("taskStepID") or found.get("currentStepID")
            print("列表返回的 stepID:", step, " nodeName:", found.get("nodeName") or found.get("currentNode"))
            if step:
                st2,txt2 = await page.evaluate(JS,[API+"/api/WorkOrder/GetWokerOrderDetail",{"taskID":found.get("taskID"),"stepID":step,"isProcess":True,"serialNum":SERIAL},tok])
                j2=json.loads(txt2); d=j2.get("data") or {}
                print("=== 用真实stepID调详情 ===")
                print(" nodeName:",d.get("nodeName")," ownerAccount:",d.get("ownerAccount")," ownerName:",d.get("ownerName"))
                print(" approvalButton:",d.get("approvalButton"))
                print(" systemButton:",d.get("systemButton"))
                print(" 全部顶层key:",list(d.keys()))
                mi=d.get("fromData",{}).get("Flow_ConsultationMainInfo",{})
                print(" ResponsibleAccount:",mi.get("ResponsibleAccount")," ResponsibleName:",mi.get("Responsib  leName"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
