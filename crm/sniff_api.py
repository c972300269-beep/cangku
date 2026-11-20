import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
SER = "WX2026102800167"

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
        calls = []
        page.on("request", lambda r: calls.append(r.url) if "/api/" in r.url else None)
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        await page.wait_for_timeout(6000)

        apis = sorted(set(calls))
        print("=== 页面加载期间 API 调用 ===")
        for a in apis: print("  ", a.split("28091")[-1])

        # 页面里含关键词的入口
        links = await page.evaluate("""()=>{const els=[...document.querySelectorAll('a,button,.menu-item,[class*=menu],[class*=tab],[class*=nav]')];const s=new Set();for(const e of els){const t=(e.textContent||'').trim();if(t&&(t.includes('工单')||t.includes('查询')||t.includes('全部')||t.includes('台账')||t.includes('列表')||t.includes('维修')))s.add(t);}return [...s];}""")
        print("\n=== 页面入口关键词 ===")
        for l in links: print("  ", l)

        # 试正确拼写的 GetWorkOrderDetail + serialNum 直查
        for url in ["/api/WorkOrder/GetWorkOrderDetail", "/api/WorkOrder/GetWorkOrderInfoBySerial"]:
            for body in [{"serialNum":SER}, {"taskID":0,"stepID":0,"isProcess":True,"serialNum":SER}]:
                st, txt = await page.evaluate(JS, [API+url, body, tok])
                if SER in txt:
                    print("\n>>> %s 命中! http %s" % (url, st))
                    try:
                        dd = json.loads(txt).get("data") or {}
                        mi = (dd.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
                        print("   taskID=%s node=%s owner=%s Responsible=%s(%s) Status=%s" % (
                            dd.get("taskID"), dd.get("nodeName"), dd.get("ownerAccount"),
                            mi.get("ResponsibleAccount"), mi.get("ResponsibleName"), mi.get("Status")))
                    except Exception as e: print("   parse err", e, txt[:200])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
