import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
SER = "WX2026102800167"

CANDIDATES = [
    "/api/WorkOrder/GetWorkOrderQueryList",
    "/api/WorkOrder/GetWorkOrderAllList",
    "/api/WorkOrder/GetWorkOrderHistoryList",
    "/api/WorkOrder/GetClosedWorkOrderList",
    "/api/WorkOrder/GetWorkOrderManageList",
    "/api/WorkOrder/GetWorkOrderSearch",
    "/api/RepairOrder/GetRepairOrderList",
    "/api/WorkOrder/GetWorkOrderRecord",
    "/api/WorkOrder/GetWorkOrderHisList",
]

def try_parse(txt):
    try:
        j = json.loads(txt)
        d = j.get("data")
        rows = d if isinstance(d, list) else (d.get("list") or d.get("rows") or [] if isinstance(d, dict) else [])
        return rows
    except Exception:
        return None

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

        # 1) 已知接口带 serialNum 条件精确查
        for url, body in [
            ("/api/WorkOrder/GetMyCreateTaskList", {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SER}]}),
            ("/api/WorkOrder/GetWorkOrderTaskList", {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SER}]}),
            ("/api/WorkOrder/GetShareTaskList", {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SER}]}),
        ]:
            st, txt = await page.evaluate(JS, [API+url, body, tok])
            rows = try_parse(txt) or []
            print("[已知] %s http %s rows=%d" % (url, st, len(rows)))
            for r in rows:
                if SER in json.dumps(r, ensure_ascii=False):
                    print("   命中 taskID=%s stepID=%s serial=%s" % (r.get("taskID"), r.get("stepID"), r.get("serialNum")))

        # 2) 候选接口
        for c in CANDIDATES:
            for body in [
                {"pageIndex":1,"pageSize":50,"conditions":[{"name":"SerialNum","value":SER}]},
                {"keyword":SER},
                {"serialNum":SER},
            ]:
                st, txt = await page.evaluate(JS, [API+c, body, tok])
                if st == 200 and SER in txt:
                    print(">>> 命中接口 %s http %s len=%d" % (c, st, len(txt)))
                    try:
                        rows = try_parse(txt) or []
                        for r in rows:
                            if SER in json.dumps(r, ensure_ascii=False):
                                print("     taskID=%s stepID=%s serial=%s node=%s" % (r.get("taskID"), r.get("stepID"), r.get("serialNum"), r.get("nodeName")))
                    except Exception: pass
                    break
                elif st == 404:
                    break
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
