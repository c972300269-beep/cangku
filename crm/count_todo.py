import asyncio, shutil, tempfile, json, re
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
API = "https://crm.linli580.cn:28091"
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
            except Exception:
                pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        # 等页面渲染（SPA）
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("token取到:", bool(tok), "len", len(tok))

        # 1) 尝试从页面直接读待办计数（卡片/徽标/文字）
        page_text = await page.evaluate("()=>document.body.innerText")
        # 找“我的待办”附近的计数
        def find_todo_count(txt):
            # 常见：我的待办 (123) 或 待办 123
            for pat in [r"我的待办[^\d]*(\d+)", r"待办[^\d]*(\d+)", r"我的工单[^\d]*(\d+)"]:
                m = re.search(pat, txt)
                if m:
                    return m.group(1)
            return None
        ui_count = find_todo_count(page_text)
        print("UI文本中待办计数( heuristic ):", ui_count)
        # 把含“待办”的那几行打印出来便于人工核对
        for line in page_text.splitlines():
            if "待办" in line or "工单" in line or "我的" in line:
                if line.strip():
                    print("  行:", line.strip()[:80])

        # 2) 直接调接口数待办（最准）
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWorkOrderTaskList",
            {"pageIndex":1,"pageSize":1,"conditions":[]}, tok])
        try:
            j = json.loads(txt)
            d = j.get("data")
            if isinstance(d, dict):
                total = d.get("total") or d.get("Total") or d.get("count")
            elif isinstance(d, list):
                total = len(d)
            else:
                total = None
            print("接口 GetWorkOrderTaskList http", st, "total=", total)
        except Exception as e:
            print("接口解析失败:", e, txt[:200])

        # 3) 也看下共享池数量
        st2, txt2 = await page.evaluate(JS, [API + "/api/WorkOrder/GetShareTaskList",
            {"pageIndex":1,"pageSize":1,"conditions":[]}, tok])
        try:
            j2 = json.loads(txt2)
            d2 = j2.get("data")
            pool_total = (d2.get("total") if isinstance(d2, dict) else (len(d2) if isinstance(d2,list) else None))
            print("接口 GetShareTaskList http", st2, "pool_total=", pool_total)
        except Exception as e:
            print("池解析失败:", e, txt2[:200])

        await page.screenshot(path="reports/crm2/workbench_todo.png", full_page=False)
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
