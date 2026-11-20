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
        st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetMyApprovalTaskList", {"pageIndex":1,"pageSize":300,"conditions":[]}, tok])
        print("status:", st)
        try:
            j = json.loads(txt)
            rows = j.get("data") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("list") or []
        except Exception as e:
            print("解析失败:", e); print(txt[:400]); rows=[]
        print("待办行数:", len(rows))
        print("\n=== 全部待办（单号 | 标题 | 节点 | taskID/stepID）===")
        for r in rows:
            f = {k:v for k,v in r.items() if not isinstance(v,(dict,list))}
            serial = f.get("serialNum") or f.get("SerialNum") or ""
            title = (f.get("title") or f.get("Title") or f.get("orderTitle") or "").replace("\n"," ")
            node = f.get("nodeName") or f.get("NodeName") or f.get("currentNode") or ""
            tid = f.get("taskID") or f.get("TaskID")
            sid = f.get("stepID") or f.get("StepID")
            s_all = json.dumps(r, ensure_ascii=False)
            tag = ""
            if "二期" in s_all or "恒达" in s_all or "飞来湖" in s_all: tag += " [二期]"
            if "AI" in s_all or "自动下单" in s_all or "自助下单" in s_all or "智能" in s_all: tag += " [AI]"
            print("%s | %s | 节点=%s | %s/%s%s" % (serial, title[:60], node, tid, sid, tag))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
