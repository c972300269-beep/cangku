#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 CRM 共享池 + 我的待办 中查找 香海二期(恒达) 的 AI 工单"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

JS = """async ([url, body, tok]) => {
    try {
        const r = await fetch(url, {method:'POST',
            headers:{'Content-Type':'application/json','authorization':tok},
            body: JSON.stringify(body)});
        return [r.status, await r.text()];
    } catch(e) { return [-1, 'ERR ' + e.message]; }
}"""

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmN_"))
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
        await page.wait_for_function("() => (document.body.innerText||'').includes('工作台')", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        # 1) 共享池
        body = {"pageIndex":1, "pageSize":200, "conditions":[]}
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetShareTaskList", body, tok])
        print("=== 共享池 GetShareTaskList ===")
        print("http", st, "len", len(txt))
        try:
            j = json.loads(txt)
            print("top keys:", list(j.keys())[:12])
            rows = j.get("data") or j.get("rows") or j.get("list") or []
            print("rows:", len(rows))
            if rows:
                print("sample keys:", list(rows[0].keys())[:40])
                Path(OUT/"pool_raw.json").write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
                # 找香海二期 / AI
                for r in rows:
                    s = json.dumps(r, ensure_ascii=False)
                    if ("二期" in s or "恒达" in s or "香海" in s) and ("AI" in s.upper() or "自动" in s or "智能" in s):
                        print("  >>> AI候选(池):", {k:r.get(k) for k in r if not isinstance(r.get(k),(dict,list))}.__str__()[:300])
        except Exception as e:
            print("parse err", e)
            print(txt[:500])

        # 2) 我的待办
        body2 = {"pageIndex":1, "pageSize":200, "conditions":[]}
        st2, txt2 = await page.evaluate(JS, [API + "/api/WorkOrder/GetWorkOrderTaskList", body2, tok])
        print("\n=== 我的待办 GetWorkOrderTaskList ===")
        print("http", st2, "len", len(txt2))
        try:
            j2 = json.loads(txt2)
            rows2 = j2.get("data") or j2.get("rows") or j2.get("list") or []
            print("rows:", len(rows2))
            if rows2:
                print("sample keys:", list(rows2[0].keys())[:40])
                Path(OUT/"todo_raw.json").write_text(json.dumps(j2, ensure_ascii=False, indent=1), encoding="utf-8")
                for r in rows2:
                    s = json.dumps(r, ensure_ascii=False)
                    if ("二期" in s or "恒达" in s or "香海" in s) and ("AI" in s.upper() or "自动" in s or "智能" in s):
                        print("  >>> AI候选(待办):", {k:r.get(k) for k in r if not isinstance(r.get(k),(dict,list))}.__str__()[:300])
        except Exception as e:
            print("parse err", e)
            print(txt2[:500])

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
