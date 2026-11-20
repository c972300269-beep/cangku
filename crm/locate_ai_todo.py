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

        for endpoint, label in [("/api/WorkOrder/GetMyApprovalTaskList","我的待办")]:
            print("\n===== %s =====" % label)
            st, txt = await page.evaluate(JS, [API+endpoint, {"pageIndex":1,"pageSize":300,"conditions":[]}, tok])
            try:
                j = json.loads(txt)
                rows = j.get("data") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("list") or []
            except Exception as e:
                print("解析失败:", e); rows=[]; print(txt[:300])
            print("行数:", len(rows))
            for r in rows:
                flat = {k:v for k,v in r.items() if not isinstance(v,(dict,list))}
                serial = flat.get("serialNum") or flat.get("SerialNum") or ""
                title = flat.get("title") or flat.get("Title") or flat.get("orderTitle") or ""
                node = flat.get("nodeName") or flat.get("NodeName") or flat.get("currentNode") or ""
                tid = flat.get("taskID") or flat.get("TaskID")
                sid = flat.get("stepID") or flat.get("StepID")
                owner = flat.get("ownerAccount") or flat.get("OwnerAccount") or ""
                s_all = json.dumps(r, ensure_ascii=False)
                flag = ""
                if "AI" in s_all or "自动" in s_all or "智能" in s_all:
                    flag = "  <<< AI相关"
                print("  %s | %s | 节点=%s | taskID=%s stepID=%s | owner=%s%s" % (serial, title, node, tid, sid, owner, flag))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
