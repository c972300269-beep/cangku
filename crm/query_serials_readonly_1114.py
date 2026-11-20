"""只读：按单号在 CRM 四个已验证列表中定位工单，输出状态与关键字段。
不做接口探测、不改任何数据、不点击任何业务按钮。
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

SERIALS = ["WX2026102800681", "WX2026102800531", "WX2026102800507"]
API = "https://crm.linli580.cn:28091"
URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
PROFILE = Path.home() / ".workbuddy" / "crm_profile"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)

LISTS = [
    ("我的待办", "/api/WorkOrder/GetWorkOrderTaskList"),
    ("工单池", "/api/WorkOrder/GetShareTaskList"),
    ("我的已办", "/api/WorkOrder/GetMyApprovalTaskList"),
    ("我的创建", "/api/WorkOrder/GetMyCreateTaskList"),
]
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

KEYS = ["serialNum", "title", "nodeName", "phaseName", "status", "state",
        "createAt", "responsibleName", "responsibleAccount", "ownerName",
        "ownerAccount", "currentHandler", "taskID", "stepID", "projectName",
        "displayName", "displayAccount", "closeAt", "finishAt"]


async def main():
    result = {s: [] for s in SERIALS}
    summary = []
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox", "--disable-gpu"], ignore_https_errors=True,
            viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("TOKEN_LEN", len(tok), "URL", page.url)
        if not tok or "login" in page.url.lower():
            print("LOGIN_REQUIRED")
            await ctx.close()
            return

        for name, path in LISTS:
            rows_all, pi = [], 1
            while pi <= 8:
                st, txt = await page.evaluate(JS, [API + path,
                    {"pageIndex": pi, "pageSize": 300, "conditions": []}, tok])
                try:
                    j = json.loads(txt)
                except Exception:
                    print("PARSE_FAIL", name, st, txt[:120]); break
                d = j.get("data")
                rows = d if isinstance(d, list) else (d.get("list") or d.get("rows") or [] if isinstance(d, dict) else [])
                tot = j.get("totalCount") or j.get("total") or j.get("Total") or 0
                rows_all.extend(rows)
                print("LIST %s page%d http=%s rows=%d total=%s success=%s" %
                      (name, pi, st, len(rows), tot, j.get("success")))
                if not rows or len(rows) < 300 or (tot and len(rows_all) >= tot):
                    break
                pi += 1
            summary.append({"list": name, "rows": len(rows_all), "total": tot})
            for r in rows_all:
                if not isinstance(r, dict):
                    continue
                sn = str(r.get("serialNum") or r.get("SerialNum") or "")
                if sn in result:
                    result[sn].append({"list": name, "row": r})

        await ctx.close()

    print("\n=== 命中明细 ===")
    for sn in SERIALS:
        hits = result[sn]
        if not hits:
            print("[--] %s  四个列表均未包含" % sn)
            continue
        for h in hits:
            r = h["row"]
            print("[OK] %s @ %s" % (sn, h["list"]))
            for k in KEYS:
                v = r.get(k, r.get(k[0].upper() + k[1:]))
                if v not in (None, "", []):
                    print("     %-20s %s" % (k, str(v)[:180]))
            print("     ALL_KEYS %s" % ",".join(list(r.keys())[:40]))
    (OUT / "serials_1114.json").write_text(
        json.dumps({"summary": summary, "result": result}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print("\nSAVED", OUT / "serials_1114.json")


asyncio.run(main())
