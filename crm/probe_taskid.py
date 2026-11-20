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
        for tid in range(7853795, 7853806):
            st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
                {"taskID": tid, "stepID": 0, "isProcess": True, "serialNum": ""}, tok])
            if st != 200:
                continue
            try:
                dd = json.loads(txt).get("data") or {}
                mi = (dd.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
                ser = (mi.get("PeriodCodeName") or "")  # 仅用于识别
                # 取标题/单号线索
                title = mi.get("CustIssueFullName") or mi.get("ProcessName") or ""
                resp_ra = mi.get("ResponsibleAccount")
                node = dd.get("nodeName")
                # 通过 serial 判断：GetWokerOrderDetail 不回 serial，用其他线索
                print("tid=%d http=%d node=%s RA=%s title=%s" % (tid, st, node, resp_ra, title[:30]))
            except Exception as e:
                print("tid=%d parse err %s" % (tid, e))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
