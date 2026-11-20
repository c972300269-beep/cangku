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
        st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetMyApprovalTaskList", {"pageIndex":1,"pageSize":5,"conditions":[]}, tok])
        j = json.loads(txt)
        rows = j.get("data") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("list") or []
        r = rows[0]
        print("--- 第1行全部字段 ---")
        for k, v in r.items():
            if isinstance(v, (dict, list)):
                print(k, "=", json.dumps(v, ensure_ascii=False)[:300])
            else:
                print(k, "=", v)
        # 再打印前8条的关键信息（尝试多字段名）
        print("\n--- 前8条 关键字段 ---")
        for r in rows[:8]:
            def g(*names):
                for n in names:
                    for k in r:
                        if k.lower() == n.lower():
                            v = r[k]
                            if not isinstance(v, (dict, list)):
                                return v
                return ""
            print(g("serialNum"), "|", str(g("title"))[:50], "| node=", g("nodeName","node","currentNode","stepName"), "| owner=", g("ownerAccount","responsibleAccount","currentHandler"), "| tid=", g("taskID","taskId"), "| sid=", g("stepID","stepId"))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
