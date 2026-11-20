import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

PROFILE = Path.home() / ".workbuddy" / "crm_profile"
API = "https://crm.linli580.cn:28091"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

SERIALS = sys.argv[1:] or ["WX2026103100077","WX2026103100074","WX2026103100094","WX2026103100080","WX2026103100062"]

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox","--disable-gpu"], ignore_https_errors=True,
            viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",
                        wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        if not tok:
            print("LOGIN_REQUIRED"); await ctx.close(); return

        # 汇总各类列表，找 taskID/stepID
        idx = {}
        for ep in ["GetMyProcessTaskList","GetWorkOrderTaskList","GetMyHandledTaskList","GetWorkOrderDoneList"]:
            for pi in range(1, 4):
                st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/"+ep, {"pageIndex":pi,"pageSize":200,"conditions":[]}, tok])
                if st != 200: break
                for s in SERIALS:
                    if s in (txt or "") and s not in idx:
                        try:
                            j = json.loads(txt); d = j.get("data")
                            rows = (d.get("list") or d.get("List") or []) if isinstance(d, dict) else (d or [])
                            for r in rows:
                                ss = json.dumps(r, ensure_ascii=False)
                                if s in ss:
                                    idx[s] = {"ep": ep, "taskID": r.get("taskID") or r.get("TaskID"),
                                              "stepID": r.get("stepID") or r.get("StepID")}
                                    break
                        except Exception: pass

        for s in SERIALS:
            info = idx.get(s) or {}
            print("\n===== %s （来源:%s taskID=%s stepID=%s）" % (s, info.get("ep"), info.get("taskID"), info.get("stepID")))
            st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWokerOrderDetail",
                {"taskID": info.get("taskID"), "stepID": info.get("stepID"), "isProcess": True, "serialNum": s}, tok])
            if st != 200:
                print("  detail HTTP", st, (txt or "")[:150]); continue
            try:
                d = json.loads(txt).get("data") or {}
            except Exception:
                print("  解析失败", txt[:200]); continue
            fd = d.get("fromData") or {}
            mi = fd.get("Flow_ConsultationMainInfo") or {}
            print("  node=%s owner=%s responsible=%s(%s)" % (
                d.get("nodeName"), d.get("ownerAccount"),
                mi.get("ResponsibleName") or fd.get("ResponsibleName"),
                mi.get("ResponsibleAccount") or fd.get("ResponsibleAccount")))
            # 兜底：正则抓全文
            s_all = json.dumps(d, ensure_ascii=False)
            for k in ["ownerAccount", "ResponsibleAccount", "ResponsibleName"]:
                m = re.findall(r'"%s":"([^"]{0,30})"' % k, s_all)
                if m: print("   raw %s -> %s" % (k, sorted(set(m))[:5]))
        await ctx.close()

asyncio.run(main())
