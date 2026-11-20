import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
# 已知 WX2026102800033 -> taskID 7853801；另一条先试 taskID=0 让系统按 serialNum 定位
ITEMS = [("WX2026102800033", 7853801), ("WX2026102800167", 0)]

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

        for serial, tid in ITEMS:
            print("\n########## %s (taskID=%s) ##########" % (serial, tid))
            for sid in [0]:
                body = {"taskID": tid, "stepID": sid, "isProcess": True, "serialNum": serial}
                st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail", body, tok])
                if st != 200:
                    print("  http", st, txt[:200]); continue
                try:
                    dd = json.loads(txt).get("data") or {}
                except Exception as e:
                    print("  解析失败", e, txt[:200]); continue
                mi = (dd.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
                print("  http", st)
                print("  nodeName       :", dd.get("nodeName"))
                print("  ownerAccount   :", dd.get("ownerAccount"))
                print("  cur stepID     :", dd.get("stepID"))
                print("  taskID         :", dd.get("taskID"))
                print("  approvalButton :", dd.get("approvalButton"))
                print("  systemButton   :", dd.get("systemButton"))
                print("  ResponsibleAcct:", mi.get("ResponsibleAccount"))
                print("  ResponsibleName:", mi.get("ResponsibleName"))
                print("  Account        :", mi.get("Account"))
                print("  Status(MI)     :", mi.get("Status"))
                # 列出 fromData 顶层键
                fd = dd.get("fromData") or {}
                print("  fromData keys  :", list(fd.keys()))
                print("  MI 相关字段    :", {k:mi.get(k) for k in mi if any(w in k for w in ["Account","Name","Responsible","Status","Node","Owner","Handler","Deal"])})
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
