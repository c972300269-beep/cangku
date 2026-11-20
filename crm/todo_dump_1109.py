"""只读：导出当前我的待办全部单号+标题，用于分派前后逐条比对。"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
PROFILE = Path.home() / ".workbuddy" / "crm_profile"
OUT = Path("E:/workbuddy/Claw/reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox", "--disable-gpu"], ignore_https_errors=True,
            viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",
                        wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        if not tok:
            print("LOGIN_REQUIRED"); await ctx.close(); return
        st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWorkOrderTaskList", {"pageIndex": 1, "pageSize": 300, "conditions": []}, tok])
        if st != 200:
            print("HTTP", st, txt[:200]); await ctx.close(); return
        j = json.loads(txt); d = j.get("data")
        rows = (d.get("list") or d.get("List") or []) if isinstance(d, dict) else (d if isinstance(d, list) else [])
        lines, seen = [], set()
        for r in rows:
            s_all = json.dumps(r, ensure_ascii=False)
            serial = str(r.get("serialNum") or r.get("SerialNum") or "")
            title = str(r.get("title") or r.get("Title") or "")
            node = str(r.get("nodeName") or r.get("NodeName") or "")
            if not serial or serial in seen: continue
            seen.add(serial)
            mark = "AI" if "AI自动下单" in title else "  "
            lines.append("%s|%s|%s|%s" % (mark, serial, node, title.replace("|", "／")[:120]))
        print("TOTAL_ROWS=%d UNIQUE=%d" % (len(rows), len(lines)))
        for l in lines: print(l)
        (OUT / "todo_dump_1109.txt").write_text("TOTAL=%d\n" % len(lines) + "\n".join(lines), encoding="utf-8")
        await ctx.close()

asyncio.run(main())
