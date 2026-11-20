import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
PROFILE = Path.home() / ".workbuddy" / "crm_profile"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

def project_of(s):
    s = s or ""
    if re.search(r"二期|恒达|飞来湖", s): return "二期"
    if re.search(r"一期|万达西|水岸", s): return "一期"
    if re.search(r"龙湖", s): return "龙湖苑"
    if re.search(r"雅悦", s): return "雅悦花园"
    return "其他"

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox","--disable-gpu"], ignore_https_errors=True,
            viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("URL:", page.url, "TOKEN_LEN:", len(tok))
        if not tok or "login" in page.url.lower():
            print("LOGIN_REQUIRED"); await ctx.close(); return
        all_rows, total = [], None
        for pi in range(1, 6):
            st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWorkOrderTaskList", {"pageIndex":pi,"pageSize":300,"conditions":[]}, tok])
            if st != 200:
                print("HTTP", st, txt[:200]); break
            j = json.loads(txt); d = j.get("data")
            if isinstance(d, dict):
                rows = d.get("list") or d.get("List") or []
                total = d.get("total") or d.get("Total") or total
            elif isinstance(d, list): rows = d
            else: rows = []
            if not rows: break
            all_rows.extend(rows)
            if len(rows) < 300: break
        print("TOTAL=%s 实拉=%d" % (total, len(all_rows)))
        seen = set()
        for r in all_rows:
            s_all = json.dumps(r, ensure_ascii=False)
            serial = str(r.get("serialNum") or r.get("SerialNum") or "")
            title = str(r.get("title") or r.get("Title") or "")
            node = str(r.get("nodeName") or r.get("NodeName") or "")
            if not serial:
                m = re.search(r'"serialNum":"([^"]+)"', s_all); serial = m.group(1) if m else ""
            if not title:
                m = re.search(r'"(?:title|orderTitle)":"([^"]{2,150})"', s_all); title = m.group(1) if m else ""
            if not serial or serial in seen: continue
            seen.add(serial)
            if "AI自动下单" in title:
                print("AI|%s|%s|%s|%s" % (serial, project_of(title+" "+serial), node, title.replace("|","／")))
        await ctx.close()

asyncio.run(main())
