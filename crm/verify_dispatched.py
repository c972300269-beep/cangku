"""复核已分派工单的当前处理人（不走待办列表，直接查工单）"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

PROFILE = Path.home() / ".workbuddy" / "crm_profile"
API = "https://crm.linli580.cn:28091"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

SERIALS = sys.argv[1:]

CANDS = [
    ("/api/WorkOrder/GetWorkOrderList", lambda s: {"serialNum": s, "pageIndex": 1, "pageSize": 10}),
    ("/api/WorkOrder/GetWorkOrderTaskList", lambda s: {"pageIndex": 1, "pageSize": 200, "conditions": [{"field": "serialNum", "value": s}]}),
    ("/api/WorkOrder/GetMyHandledTaskList", lambda s: {"pageIndex": 1, "pageSize": 200, "conditions": []}),
]

KEYS = ("responsible", "handler", "owner", "account", "name", "stepName", "node", "status", "serial")


def rows_of(j):
    d = j.get("data")
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        return d.get("list") or d.get("rows") or d.get("records") or []
    return []


def brief(r):
    out = {}
    for k, v in r.items():
        lk = k.lower()
        if any(x in lk for x in KEYS) and not isinstance(v, (dict, list)):
            out[k] = str(v)[:40]
    return out


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox", "--disable-gpu"], ignore_https_errors=True,
            viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",
                        wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(5000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("TOKEN_LEN:", len(tok))

        for serial in SERIALS:
            print("\n===== %s =====" % serial)
            got = False
            for path, mkb in CANDS:
                st, txt = await page.evaluate(JS, [API + path, mkb(serial), tok])
                if st != 200:
                    print("  %s -> HTTP %s" % (path, st))
                    continue
                try:
                    j = json.loads(txt)
                except Exception:
                    print("  %s -> 非JSON" % path)
                    continue
                rows = rows_of(j)
                hits = [r for r in rows if serial in json.dumps(r, ensure_ascii=False)]
                if hits:
                    got = True
                    print("  %s -> 命中 %d 行" % (path, len(hits)))
                    for r in hits[:3]:
                        print("   ", json.dumps(brief(r), ensure_ascii=False))
                else:
                    print("  %s -> 0 行 (总 %d)" % (path, len(rows)))
            if not got:
                print("  (未在已选接口中定位到该单)")
        await ctx.close()


asyncio.run(main())
