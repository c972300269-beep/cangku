import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(r.body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
JS2 = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default", "Local State"]:
        s = CH / it; d = td / it
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns("Cache","Code Cache","GPUCache","ShaderCache","Service Worker","IndexedDB","blob_storage","File System","shared_proto_db","WebStorage","Extensions","Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(user_data_dir=str(td), headless=True, args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"], ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(8000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        st, txt = await page.evaluate(JS2, [API+"/api/WorkOrder/GetShareTaskList", {"pageIndex":1,"pageSize":100,"conditions":[]}, tok])
        print("共享池 status:", st)
        try:
            j = json.loads(txt)
            rows = j.get("data") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("list") or []
        except Exception as e:
            print("解析失败:", e, txt[:300]); rows=[]
        print("共享池行数:", len(rows))
        print("\n=== 二期 / 今日 共享池单 ===")
        for r in rows:
            def g(*names):
                for n in names:
                    for k in r:
                        if k.lower() == n.lower():
                            v = r[k]
                            if not isinstance(v, (dict, list)):
                                return v
                return ""
            serial = g("serialNum"); title = str(g("title")); node = g("nodeName"); tid = g("taskID"); sid = g("stepID"); ca = str(g("createAt"))
            if ("二期" in title or "恒达" in title or "飞来湖" in title) or ca.startswith("2026-10-29"):
                print("%s | %s | 节点=%s | createAt=%s | tid=%s" % (serial, title[:55], node, ca[:16], tid))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
