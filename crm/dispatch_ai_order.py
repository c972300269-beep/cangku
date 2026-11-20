#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""派单：将 AI 工单 WX2026102700498 分派给 吕飞凡(lvfeifan)。
关键点：分派动作由「处理人」字段(顶层 Account)驱动，formatChangeData 会把它映射为
顶层 Account/ResponsibleAccount/ResponsibleName；后端据此确定下一处理人。
因此必须把顶层这三个字段都设为目标人，同时同步 Flow_ConsultationMainInfo 内同名字段。
处理说明(ApprovalComments)为必填。"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

TASK_ID = 7853065
SERIAL = "WX2026102700498"
NEW_ACCOUNT = "lvfeifan"
NEW_NAME = "吕飞凡"
DISPATCH_NOTE = "已分派至工程技工吕飞凡跟进处理（AI自动下单工单）"

def get_current_step():
    try:
        j = json.load(open(OUT/"ai_dispatch_verify.json", encoding="utf-8"))
        return int((j.get("data") or {}).get("stepID") or 75888131)
    except Exception:
        return 75888131

JS = """async ([url, body, tok]) => {
    try {
        const r = await fetch(url, {method:'POST',
            headers:{'Content-Type':'application/json','authorization':tok},
            body: JSON.stringify(body)});
        return [r.status, await r.text()];
    } catch(e) { return [-1, 'ERR ' + e.message]; }
}"""

async def main():
    raw = json.loads((OUT/"ai_detail_raw.json").read_text(encoding="utf-8"))
    from_data = raw["data"]["fromData"]
    main_info = from_data["Flow_ConsultationMainInfo"]
    step_id = get_current_step()
    print("== 当前步骤 stepID =", step_id, "==")

    print("== 派单前 ==")
    print("  [顶层] Account =", from_data.get("Account"))
    print("  [顶层] ResponsibleAccount =", from_data.get("ResponsibleAccount"))
    print("  [嵌套] ResponsibleAccount =", main_info.get("ResponsibleAccount"))
    print("  [嵌套] ResponsibleName    =", main_info.get("ResponsibleName"))

    # 1) 顶层字段（分派驱动字段，仿 formatChangeData 映射）
    from_data["Account"] = NEW_ACCOUNT
    from_data["ResponsibleAccount"] = NEW_ACCOUNT
    from_data["ResponsibleName"] = NEW_NAME
    from_data["ApprovalComments"] = DISPATCH_NOTE
    from_data["LinliApprovalCache"] = ""
    # 2) 嵌套字段（保证记录与处理人一致）
    main_info["ResponsibleAccount"] = NEW_ACCOUNT
    main_info["ResponsibleName"] = NEW_NAME
    main_info["Assigner"] = "陈家林"

    submit_body = {
        "taskID": TASK_ID,
        "stepID": step_id,
        "method": "Process",
        "comment": DISPATCH_NOTE,
        "actionName": "分派",
        "formData": from_data,
        "approvalType": "Default",
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

        print("== 提交派单 ==")
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/ApprovalTask", submit_body, tok])
        print("http", st)
        print("resp", txt[:900])

        await page.wait_for_timeout(2000)
        print("== 回查工单详情 ==")
        detail_body = {"taskID": TASK_ID, "stepID": step_id, "isProcess": True, "serialNum": SERIAL}
        st2, txt2 = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail", detail_body, tok])
        try:
            j2 = json.loads(txt2)
            fd2 = (j2.get("data") or {}).get("fromData") or {}
            mi2 = fd2.get("Flow_ConsultationMainInfo") or {}
            d2 = j2.get("data") or {}
            print("  回查 http", st2, "success", j2.get("success"))
            print("  [顶层] Account =", fd2.get("Account"))
            print("  [顶层] ResponsibleAccount =", fd2.get("ResponsibleAccount"))
            print("  [嵌套] ResponsibleAccount =", mi2.get("ResponsibleAccount"))
            print("  [嵌套] ResponsibleName    =", mi2.get("ResponsibleName"))
            print("  Assigner           =", mi2.get("Assigner"))
            print("  nodeName           =", d2.get("nodeName"))
            print("  ownerAccount       =", d2.get("ownerAccount"))
            (OUT/"ai_dispatch_verify.json").write_text(json.dumps(j2, ensure_ascii=False, indent=1), encoding="utf-8")
        except Exception as e:
            print("verify parse err", e); print(txt2[:600])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
