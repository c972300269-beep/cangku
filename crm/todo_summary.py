import asyncio, shutil, tempfile, json, re
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

def project_of(s):
    s = s or ""
    if re.search(r"一期|万达西|水岸", s): return "香海一期(万达西)"
    if re.search(r"二期|恒达|飞来湖|香海彼岸", s): return "香海二期(恒达/飞来湖)"
    if re.search(r"龙湖", s): return "龙湖苑"
    if re.search(r"雅悦", s): return "雅悦花园"
    return "其他/未标注"

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

        all_rows = []
        for pi in range(1, 7):
            st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetMyApprovalTaskList", {"pageIndex":pi,"pageSize":300,"conditions":[]}, tok])
            try:
                j = json.loads(txt)
                rows = j.get("data") if isinstance(j.get("data"), list) else (j.get("data") or {}).get("list") or []
            except Exception as e:
                print("第%d页解析失败:" % pi, e, txt[:200]); break
            if not rows: break
            all_rows.extend(rows)
            if len(rows) < 300: break
        print("TOTAL=%d" % len(all_rows))
        for r in all_rows:
            flat = {k:v for k,v in r.items() if not isinstance(v,(dict,list))}
            serial = str(flat.get("serialNum") or flat.get("SerialNum") or "")
            title = str(flat.get("title") or flat.get("Title") or flat.get("orderTitle") or "")
            node = str(flat.get("nodeName") or flat.get("NodeName") or "")
            created = str(flat.get("createAt") or flat.get("CreateAt") or flat.get("createTime") or "")
            # 若 flat 字段缺失，从整行 JSON 里兜底搜
            s_all = json.dumps(r, ensure_ascii=False)
            if not title:
                m = re.search(r'"(?:title|Title|orderTitle)":"([^"]{2,120})"', s_all)
                title = m.group(1) if m else ""
            if not node:
                m = re.search(r'"(?:nodeName|NodeName)":"([^"]{1,40})"', s_all)
                node = m.group(1) if m else ""
            print("ROW|%s|%s|%s|%s" % (serial, project_of(title+" "+serial), node, title.replace("|","／")))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
