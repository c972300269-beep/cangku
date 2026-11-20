#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""查吕飞凡名下全部工单（不限类型），统计状态，列出非05及最近的"""
import asyncio, shutil, tempfile, json
from collections import Counter
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"

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
    td = Path(tempfile.mkdtemp(prefix="chrome_lvf2_"))
    for item in ["Default","Local State"]:
        s = CHROME_USER_DATA / item; d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache","Code Cache","GPUCache","ShaderCache","Service Worker",
                        "IndexedDB","blob_storage","File System","shared_proto_db",
                        "WebStorage","Extensions","Crashpad"), dirs_exist_ok=True)
                else: shutil.copy2(s, d)
            except Exception: pass
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

        body = {"conditions":[{"fieldName":"responsibleName","fieldValue":"吕飞凡","conditionalType":1}],
                "pageIndex":1,"pageSize":200}
        res = await page.evaluate(JS_QUERY, [API, body, tok])
        if not res.get("ok"):
            print("查询失败:", res); await ctx.close(); return
        data = res["data"]
        lst = data.get("data") if isinstance(data,dict) else None
        if lst is None and isinstance(data,dict):
            for k,v in data.items():
                if isinstance(v,list): lst=v; break
        if not lst:
            print("无列表, keys:", list(data.keys()) if isinstance(data,dict) else type(data))
            await ctx.close(); return
        print("吕飞凡名下总条数:", len(lst), "totalCount=", data.get("totalCount"))
        c = Counter(str(r.get("status")) for r in lst)
        print("状态分布:", dict(c))
        non05 = [r for r in lst if str(r.get("status"))!="05"]
        print(f"\n非05(待处理/处理中)共 {len(non05)} 条:")
        for r in non05:
            print(f"  {r.get('serialNum')} | {r.get('title','')[:50]} | 状态={r.get('status')} | 创建={str(r.get('created'))[:10]}")
        # 最近的10条（按created倒序）
        def cd(r):
            v=str(r.get("created") or "")
            return v
        recent = sorted(lst, key=cd, reverse=True)[:10]
        print("\n最近10条(含创建时间):")
        for r in recent:
            print(f"  {r.get('serialNum')} | 状态={r.get('status')} | 创建={str(r.get('created'))[:19]} | {r.get('title','')[:46]}")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
