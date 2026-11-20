#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""查吕飞凡(吕非凡)名下、香海二期的 CRM 工单"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)

CANDIDATES_NAME = ["吕飞凡", "吕非凡"]

JS_QUERY = """async ([api, body, tok]) => {
    try {
        const r = await fetch(api + '/api/Consultation/GetConsultationPage', {
            method: 'POST',
            headers: {'Content-Type':'application/json','authorization': tok},
            body: JSON.stringify(body)
        });
        const t = await r.text();
        try { return {ok:true, data: JSON.parse(t)}; } catch(e){ return {ok:false, raw:t.slice(0,500)}; }
    } catch(e){ return {ok:false, err:e.message}; }
}"""

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_lvf_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db",
                        "WebStorage","Extensions","Crashpad"), dirs_exist_ok=True)
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
        await page.goto(BASE, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('工作台')", timeout=90000)
        await page.wait_for_timeout(3000)
        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        found = []
        for nm in CANDIDATES_NAME:
            body = {
                "conditions":[
                    {"fieldName":"processName","fieldValue":"维修工单","conditionalType":0},
                    {"fieldName":"responsibleName","fieldValue":nm,"conditionalType":1}
                ],
                "pageIndex":1,"pageSize":50
            }
            res = await page.evaluate(JS_QUERY, [API, body, tok])
            if not res.get("ok"):
                print(f"[{nm}] 查询失败:", res.get("err"), res.get("raw"))
                continue
            data = res["data"]
            lst = None
            if isinstance(data, dict):
                lst = data.get("data") or data.get("list") or data.get("result") or data.get("rows")
                if lst is None and "data" in data and isinstance(data["data"], dict):
                    lst = data["data"].get("list") or data["data"].get("data")
            if not lst:
                print(f"[{nm}] 返回结构无列表，结构:", list(data.keys()) if isinstance(data,dict) else type(data))
                print("   raw:", json.dumps(data, ensure_ascii=False)[:400])
                continue
            print(f"[{nm}] 命中 {len(lst)} 条")
            for r in lst:
                proj = r.get("projectName") or r.get("communityName") or r.get("estateName") or r.get("deptName") or ""
                title = r.get("title") or r.get("problemDesc") or ""
                print(f"   {r.get('serialNum')} | {proj} | {title[:40]} | 状态={r.get('status')} | 责任人={r.get('responsibleName')} | 部门={r.get('responsibleDeptName')}")
                if any(k in (proj or "") for k in ["香海","二期","恒达","清远"]):
                    found.append(r)
        Path(OUT/"lvf_raw.json").write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")
        print("\n香海二期相关:", len(found), "条 ->", OUT/"lvf_raw.json")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
