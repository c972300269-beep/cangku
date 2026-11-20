import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
TASK_ID = 7856478
STEP_ID = 75916214
SERIAL = "WX2026102900014"
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
        st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail", {"taskID":TASK_ID,"stepID":STEP_ID,"isProcess":True,"serialNum":SERIAL}, tok])
        print("status:", st)
        try:
            d = json.loads(txt)
            data = d.get("data") or {}
            # 顶层关键字段
            keys = ["nodeName","NodeName","status","Status","responsibleAccount","ResponsibleAccount",
                    "responsibleName","ResponsibleName","ownerAccount","currentHandler","CurrentHandler",
                    "serialNum","title","closeAccount","CloseAccount"]
            for k in keys:
                if k in data:
                    print("  %s = %s" % (k, data[k]))
            # fromData 里的关键字段
            fd = data.get("fromData") or data.get("formData") or {}
            if isinstance(fd, dict):
                for k in ["Account","ResponsibleAccount","ResponsibleName","ApprovalComments","nodeName","Status"]:
                    if k in fd:
                        print("  fromData.%s = %s" % (k, fd[k]))
            # 流转记录
            logs = data.get("flowLog") or data.get("FlowLog") or data.get("logs") or []
            if isinstance(logs, list) and logs:
                print("  --- 最近流转 ---")
                for l in logs[-5:]:
                    s = json.dumps(l, ensure_ascii=False)
                    print("   ", s[:200])
            if not any(k in data for k in keys):
                print("原始返回(截断):", txt[:600])
        except Exception as e:
            print("解析失败:", e)
            print(txt[:600])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
