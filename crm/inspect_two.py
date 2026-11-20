import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
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
            except Exception: pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(5000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        # 列表里两单的字段
        st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetMyApprovalTaskList",
            {"pageIndex":1,"pageSize":300,"conditions":[]}, tok])
        try:
            j = json.loads(txt)
            rows = j.get("data") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("list") or []
        except Exception:
            rows = []
        print("列表行数:", len(rows))
        for r in rows:
            s = json.dumps(r, ensure_ascii=False)
            if "WX2026102800167" in s or "WX2026102800033" in s:
                flat = {k:v for k,v in r.items() if not isinstance(v,(dict,list))}
                print("\n== 列表行 ==")
                for k in ["serialNum","taskID","stepID","nodeName","status","Status","ownerAccount","ownerName","responsibleAccount","ResponsibleAccount","responsibleName","currentNode","currentHandler","approveState","processState"]:
                    if k in flat: print("  %s = %s" % (k, flat[k]))

        # 167 详情
        for tid in [7854281, 7853801]:
            print("\n########## 详情 taskID=%d ##########" % tid)
            st2, txt2 = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
                {"taskID": tid, "stepID": 0, "isProcess": True, "serialNum": ""}, tok])
            if st2 != 200:
                print("  http", st2, txt2[:200]); continue
            try:
                dd = json.loads(txt2).get("data") or {}
            except Exception as e:
                print("  parse err", e, txt2[:200]); continue
            mi = (dd.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
            print("  nodeName      :", dd.get("nodeName"))
            print("  ownerAccount  :", dd.get("ownerAccount"))
            print("  approvalButton:", dd.get("approvalButton"))
            print("  systemButton  :", dd.get("systemButton"))
            print("  ResponsibleAcct:", mi.get("ResponsibleAccount"))
            print("  ResponsibleName:", mi.get("ResponsibleName"))
            print("  Status(MI)    :", mi.get("Status"))
            print("  CloseAccount  :", mi.get("CloseAccount"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
