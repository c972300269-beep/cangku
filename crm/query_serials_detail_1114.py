"""只读：取三条工单的表单详情（故障描述、位置、当前节点、可用按钮）。
串行 3 次请求，不点击、不提交、不改数据。
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
PROFILE = Path.home() / ".workbuddy" / "crm_profile"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
ITEMS = [
    ("WX2026102800681", 7856171, 75913256),
    ("WX2026102800531", 7855723, 75909005),
    ("WX2026102800507", 7855628, 75908210),
]
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""


async def main():
    saved = {}
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox", "--disable-gpu"], ignore_https_errors=True,
            viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("TOKEN_LEN", len(tok))
        if not tok:
            print("LOGIN_REQUIRED"); await ctx.close(); return

        for serial, tid, sid in ITEMS:
            body = {"taskID": tid, "stepID": sid, "isProcess": True, "serialNum": serial}
            st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail", body, tok])
            print("\n===== %s http=%s =====" % (serial, st))
            try:
                j = json.loads(txt)
            except Exception as e:
                print("  PARSE_FAIL", e, txt[:200]); continue
            dd = j.get("data") or {}
            saved[serial] = dd
            for k in ("serialNum", "nodeName", "ownerAccount", "ownerDisplayName",
                      "stepID", "taskID", "status", "orderStatus", "phaseName"):
                if dd.get(k) not in (None, ""):
                    print("  %-18s %s" % (k, str(dd.get(k))[:150]))
            fd = dd.get("fromData") or {}
            print("  fromData keys  :", list(fd.keys())[:25])
            mi = fd.get("Flow_ConsultationMainInfo") or {}
            if isinstance(mi, dict):
                want = [k for k in mi if any(w in k for w in
                        ("Desc", "Content", "Remark", "Address", "Location", "Project",
                         "Name", "Phone", "Responsible", "Status", "Type", "Level", "Fault"))]
                for k in want[:30]:
                    print("    MI %-22s %s" % (k, str(mi.get(k))[:180]))
            for b in ("approvalButton", "systemButton"):
                v = dd.get(b)
                if v:
                    print("  %-18s %s" % (b, json.dumps(v, ensure_ascii=False)[:300]))
        await ctx.close()
    (OUT / "serials_detail_1114.json").write_text(
        json.dumps(saved, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nSAVED", OUT / "serials_detail_1114.json")


asyncio.run(main())
