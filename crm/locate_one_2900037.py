import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
TARGET = "WX2026102900037"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

async def search(page, endpoint, tok, label):
    print("\n===== %s =====" % label)
    st, txt = await page.evaluate(JS, [API+endpoint, {"pageIndex":1,"pageSize":300,"conditions":[]}, tok])
    try:
        j = json.loads(txt)
        rows = j.get("data") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("list") or []
    except Exception as e:
        print("解析失败:", e); print(txt[:300]); return None
    print("行数:", len(rows))
    for r in rows:
        flat = {k:v for k,v in r.items() if not isinstance(v,(dict,list))}
        serial = flat.get("serialNum") or flat.get("SerialNum") or ""
        if serial != TARGET:
            continue
        title = flat.get("title") or flat.get("Title") or flat.get("orderTitle") or ""
        node = flat.get("nodeName") or flat.get("NodeName") or flat.get("currentNode") or ""
        tid = flat.get("taskID") or flat.get("TaskID")
        sid = flat.get("stepID") or flat.get("StepID")
        owner = flat.get("ownerAccount") or flat.get("OwnerAccount") or flat.get("responsibleAccount") or ""
        status = flat.get("status") or flat.get("Status") or ""
        print("  >>> 命中: serial=%s | title=%s | 节点=%s | taskID=%s | stepID=%s | owner=%s | status=%s" % (serial, title, node, tid, sid, owner, status))
        return r
    print("  (未在 %s 找到)" % label)
    return None

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
            except Exception: pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(user_data_dir=str(td), headless=True, args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"], ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(5000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("token长度:", len(tok))
        hit = await search(page, "/api/WorkOrder/GetMyApprovalTaskList", tok, "我的待办")
        if not hit:
            hit = await search(page, "/api/WorkOrder/GetMyDoneTaskList", tok, "我的已办")
        if not hit:
            hit = await search(page, "/api/WorkOrder/GetMyCreateTaskList", tok, "我创建的")
        if hit:
            flat = {k:v for k,v in hit.items() if not isinstance(v,(dict,list))}
            tid = flat.get("taskID") or flat.get("TaskID")
            sid = flat.get("stepID") or flat.get("StepID")
            if tid and sid:
                print("\n--- 调详情 GetWokerOrderDetail ---")
                st2, txt2 = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail", {"taskID":tid,"stepID":sid,"isProcess":True,"serialNum":TARGET}, tok])
                print("详情 status:", st2)
                try:
                    d2 = json.loads(txt2)
                    # 打印关键字段
                    dd = d2.get("data") or {}
                    for k in ["nodeName","NodeName","currentNode","status","Status","responsibleAccount","ResponsibleAccount","ownerAccount","flowStatus"]:
                        if k in dd:
                            print("  %s = %s" % (k, dd[k]))
                    s2 = json.dumps(d2, ensure_ascii=False)
                    for kw in ["分派","转派","汇报完成","同意","提交","处理","Account","account"]:
                        if kw in s2:
                            print("  含关键字:", kw)
                except Exception as e:
                    print("详情解析失败:", e); print(txt2[:400])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
