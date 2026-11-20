import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
TARGETS = ["WX2026102800167", "WX2026102800033"]
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

def rows_of(j):
    d = j.get("data")
    if isinstance(d, list): return d
    if isinstance(d, dict): return d.get("list") or d.get("rows") or []
    return []

async def locate_in(page, tok, label, url, body):
    st, txt = await page.evaluate(JS, [API+url, body, tok])
    try:
        j = json.loads(txt); rows = rows_of(j)
    except Exception as e:
        print("[%s] 解析失败 http=%s err=%s" % (label, st, e)); print(txt[:300]); return []
    print("\n=== %s (http %s, 行数 %d) ===" % (label, st, len(rows)))
    hits = []
    for r in rows:
        s = json.dumps(r, ensure_ascii=False)
        if any(t in s for t in TARGETS):
            hits.append(r)
            print("  >>> 命中:", {k:r.get(k) for k in r if not isinstance(r.get(k),(dict,list))})
    if not hits:
        print("  (无目标单)")
    return hits

async def detail(page, tok, task_id, step_id, serial):
    st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
        {"taskID": task_id, "stepID": step_id, "isProcess": True, "serialNum": serial}, tok])
    try:
        dd = json.loads(txt).get("data") or {}
        mi = (dd.get("fromData") or {}).get("Flow_ConsultationMainInfo") or {}
        print("    [详情] node=%s owner=%s | Responsible=%s(%s)" % (
            dd.get("nodeName"), dd.get("ownerAccount"),
            mi.get("ResponsibleAccount"), mi.get("ResponsibleName")))
    except Exception as e:
        print("    [详情] 解析失败", e, txt[:200])

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

        hits1 = await locate_in(page, tok, "我的待办 GetWorkOrderTaskList",
            "/api/WorkOrder/GetWorkOrderTaskList", {"pageIndex":1,"pageSize":300,"conditions":[]})
        hits2 = await locate_in(page, tok, "共享池 GetShareTaskList",
            "/api/WorkOrder/GetShareTaskList", {"pageIndex":1,"pageSize":300,"conditions":[]})
        hits3 = await locate_in(page, tok, "我创建的 GetMyCreateTaskList",
            "/api/WorkOrder/GetMyCreateTaskList", {"pageIndex":1,"pageSize":300,"conditions":[]})

        for label, hits in [("待办",hits1),("池",hits2),("创建",hits3)]:
            for r in hits:
                tid = r.get("taskID"); sid = r.get("stepID"); ser = r.get("serialNum")
                if tid and sid:
                    print("\n-- %s 目标 %s (来自%s) --" % (ser, label, label))
                    await detail(page, tok, tid, sid, ser)
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
