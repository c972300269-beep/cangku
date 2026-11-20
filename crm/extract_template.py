import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)
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
        for tid, ser in [(7854281,"WX2026102800167"), (7853801,"WX2026102800033")]:
            st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
                {"taskID": tid, "stepID": 0, "isProcess": True, "serialNum": ser}, tok])
            try:
                dd = json.loads(txt).get("data") or {}
                fd = dd.get("fromData") or {}
                mi = fd.get("Flow_ConsultationMainInfo") or {}
                # 提取关键业务字段（用于新建模板）
                keys = ["ProcessName","ProjectName","ProjectCodeName","PeriodName","PeriodCodeName",
                        "BuildingCodeName","BuildName","FloorCodeName","RoomCodeName","RepairBuildName",
                        "CustIssueFullName","EngRepairIssueFullName","RequesterName","OwnerName","OwnerPhone",
                        "ResponsibleDeptName","OUName","OrgName","OrgCodeName","RepairPeriodName",
                        "RepairAmount","Housekeeper","HousekeeperAccount","Status","CloseAccount","CreatedByAccount"]
                summary = {k: mi.get(k) for k in keys}
                print("\n== %s (taskID %d) ==" % (ser, tid))
                for k,v in summary.items():
                    print("  %s = %s" % (k, v))
                (OUT/("template_%s.json" % ser)).write_text(json.dumps(fd, ensure_ascii=False, indent=1), encoding="utf-8")
                print("  已存模板 ->", OUT/("template_%s.json" % ser))
            except Exception as e:
                print("  parse err", e, txt[:200])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
