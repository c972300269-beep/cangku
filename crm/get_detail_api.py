#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""直接调用 GetWokerOrderDetail 获取 AI 工单完整字段，并探查派单 API"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
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
        await page.wait_for_timeout(4000)
        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        body = {"taskID": 7853065, "stepID": 75887304, "isProcess": True, "serialNum": "WX2026102700498"}
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWokerOrderDetail", body, tok])
        print("http", st, "len", len(txt))
        try:
            j = json.loads(txt)
            Path(OUT/"ai_detail_raw.json").write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
            print("success:", j.get("success"))
            data = j.get("data") or {}
            print("data keys:", list(data.keys())[:40])
            # 找责任人 / 派单 相关字段
            for k in data:
                if any(s in k.lower() for s in ['resp','assign','person','owner','handler','dispat','responsible','account','name','dept']):
                    v = data[k]
                    if not isinstance(v,(dict,list)):
                        print(f"  {k} = {str(v)[:80]}")
            # fromData 里
            fd = data.get("fromData") or {}
            if fd:
                print("fromData keys:", list(fd.keys())[:50])
                for k in fd:
                    if any(s in k.lower() for s in ['resp','assign','person','owner','handler','dispat','responsible','account','name']):
                        print(f"  fromData.{k} = {str(fd[k])[:80]}")
        except Exception as e:
            print("parse err", e); print(txt[:600])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
