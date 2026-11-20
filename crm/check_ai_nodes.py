import asyncio, shutil, tempfile, json, time
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

CAND = [
    ("WX2026102700001", 7851063),
    ("WX2026102400212", 7843132),
    ("WX2026102400011", 7842405),
    ("WX2026102300101", 7840182),
    ("WX2026102200581", 7839090),
    ("WX2026102200345", 7838161),
    ("WX2026102200245", 7837779),
    ("WX2026102100500", 7835244),
    ("WX2026102100317", 7834529),
    ("WX2026102100004", 7833525),
    ("WX2026102000426", 7832866),
    ("WX2026102000261", 7832123),
    ("WX2026102000169", 7831777),
    ("WX2026102000168", 7831776),
    ("WX2026102000071", 7831487),
]

async def query(page, tok, serial, tid):
    for attempt in range(3):
        st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
            {"taskID": tid, "stepID": 0, "isProcess": True, "serialNum": serial}, tok])
        if st == 200:
            try:
                dd = json.loads(txt).get("data") or {}
            except Exception:
                return serial, "parse_err"
            node = dd.get("nodeName")
            mi = (dd.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
            resp = mi.get("ResponsibleAccount") or mi.get("ResponsibleName") or ""
            appr = dd.get("approvalButton") or []
            sysb = dd.get("systemButton") or []
            btns = (appr if isinstance(appr, list) else []) + (sysb if isinstance(sysb, list) else [])
            return serial, "节点=%s | 责任=%s | 按钮=%s" % (node, resp, btns)
        await asyncio.sleep(3)
    return serial, "FAIL_http_%s" % st

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
        for serial, tid in CAND:
            res = await query(page, tok, serial, tid)
            print("%s -> %s" % res)
            await asyncio.sleep(1.5)
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
