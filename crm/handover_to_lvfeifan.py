#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""恢复：将已误派给 chenjialin3 的 AI 工单 WX2026102700498 通过「任务移交」(HandOverTasks)
转交给 吕飞凡(lvfeifan)。HandOverTasks 是人员到人转移，参数为
{account: 目标人, userAccount: 当前人, memberFullName, comments, stepID}。"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

TASK_ID = 7853065
SERIAL = "WX2026102700498"
TARGET = "lvfeifan"
CURRENT_USER = "chenjialin3"
COMMENTS = "转派给工程技工吕飞凡跟进处理（AI自动下单工单）"

JS = """async ([url, body, tok]) => {
    try {
        const r = await fetch(url, {method:'POST',
            headers:{'Content-Type':'application/json','authorization':tok},
            body: JSON.stringify(body)});
        return [r.status, await r.text()];
    } catch(e) { return [-1, 'ERR ' + e.message]; }
}"""

def get_current_step():
    try:
        j = json.load(open(OUT/"ai_dispatch_verify.json", encoding="utf-8"))
        return int((j.get("data") or {}).get("stepID") or 75888131)
    except Exception:
        return 75888131

async def main():
    step_id = get_current_step()
    print("== 当前步骤 stepID =", step_id, "==")

    body = {
        "account": TARGET,
        "userAccount": CURRENT_USER,
        "memberFullName": "",
        "comments": COMMENTS,
        "stepID": [step_id],
    }

    td = Path(tempfile.mkdtemp(prefix="chrome_crmW_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db","WebStorage",
                        "Extensions","Crashpad"), dirs_exist_ok=True)
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
        await page.wait_for_function("() => (document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(3000)
        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        print("== 提交任务移交 HandOverTasks ==")
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/HandOverTasks", body, tok])
        print("http", st)
        print("resp", txt[:900])

        await page.wait_for_timeout(2000)
        print("== 回查工单详情 ==")
        detail_body = {"taskID": TASK_ID, "stepID": step_id, "isProcess": True, "serialNum": SERIAL}
        st2, txt2 = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail", detail_body, tok])
        try:
            j2 = json.loads(txt2)
            d2 = j2.get("data") or {}
            fd2 = d2.get("fromData") or {}
            mi2 = fd2.get("Flow_ConsultationMainInfo") or {}
            print("  回查 http", st2, "success", j2.get("success"))
            print("  nodeName     =", d2.get("nodeName"))
            print("  ownerAccount =", d2.get("ownerAccount"))
            print("  ownerName    =", d2.get("ownerName"))
            print("  [嵌套] ResponsibleAccount =", mi2.get("ResponsibleAccount"))
            print("  [嵌套] ResponsibleName    =", mi2.get("ResponsibleName"))
            # progressStepDetails 最新
            for x in (d2.get("progressStepDetails") or [])[-3:]:
                print("   step:", x.get("phase"), x.get("stepID"), x.get("account"), x.get("displayName"))
            (OUT/"ai_dispatch_verify.json").write_text(json.dumps(j2, ensure_ascii=False, indent=1), encoding="utf-8")
        except Exception as e:
            print("verify parse err", e); print(txt2[:600])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
