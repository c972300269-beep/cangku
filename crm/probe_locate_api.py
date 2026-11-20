import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

CANDIDATES = [
    "/api/WorkOrder/GetWorkOrderList",
    "/api/WorkOrder/GetWorkOrderPage",
    "/api/WorkOrder/QueryWorkOrderList",
    "/api/WorkOrder/SearchWorkOrder",
    "/api/WorkOrder/GetWorkOrderBySerialNum",
    "/api/WorkOrder/GetWorkOrderTrack",
    "/api/WorkOrder/GetProcessTrack",
    "/api/WorkOrder/GetWorkOrderInfo",
]

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

        # 试探全局查询接口
        cond = [{"name":"SerialNum","value":"WX2026102800033"}]
        for c in CANDIDATES:
            for body in [{"pageIndex":1,"pageSize":20,"conditions":cond}, {"serialNum":"WX2026102800033"}]:
                st, txt = await page.evaluate(JS, [API+c, body, tok])
                snippet = txt[:160].replace("\n"," ")
                hit = ("WX2026102800033" in txt) or ("7853801" in txt)
                print("API %s | http %s | 命中=%s | %s" % (c, st, hit, snippet))
                if hit:
                    print("   >>> 命中接口! 完整长度 %d" % len(txt))
                break  # 每个接口只试第一种 body，除非第一种明确 404/空

        # 用 taskID 直接查详情（试 stepID=0 与省略）
        print("\n--- 直接 taskID 详情探测 ---")
        for sid in [0, None]:
            body = {"taskID": 7853801, "isProcess": True, "serialNum": "WX2026102800033"}
            if sid is not None: body["stepID"] = sid
            st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail", body, tok])
            print("stepID=%s http %s | %s" % (sid, st, txt[:200]))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
