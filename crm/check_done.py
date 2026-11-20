import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
TARGETS = ["WX2026102800167", "WX2026102800033"]
CAND = [
    "/api/WorkOrder/GetMyProcessTaskList",
    "/api/WorkOrder/GetMyDoneTaskList",
    "/api/WorkOrder/GetFinishedTaskList",
    "/api/WorkOrder/GetMyHandledTaskList",
    "/api/WorkOrder/GetWorkOrderDoneList",
    "/api/WorkOrder/GetMyCompleteTaskList",
    "/api/WorkOrder/GetMyProcessedList",
]

def rows_of(j):
    d = j.get("data")
    if isinstance(d, list): return d
    if isinstance(d, dict): return d.get("list") or d.get("rows") or []
    return []

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

        for c in CAND:
            st, txt = await page.evaluate(JS, [API+c, {"pageIndex":1,"pageSize":200,"conditions":[]}, tok])
            if st != 200:
                continue
            try:
                rows = rows_of(json.loads(txt))
            except Exception:
                continue
            if not rows:
                continue
            print("\n=== %s (http %s, 行数 %d) ===" % (c, st, len(rows)))
            for r in rows:
                s = json.dumps(r, ensure_ascii=False)
                if any(t in s for t in TARGETS):
                    print("  >>> 命中:", {k:r.get(k) for k in r if not isinstance(r.get(k),(dict,list))})
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
