#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓 CRM 真实请求头 + 用 token 试调查询接口"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091/api"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)
SERIAL = "WX2026091400235"


async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_crm3_"))
    for item in ["Default", "Local State"]:
        src = CHROME_USER_DATA / item
        dst = temp_dir / item
        if src.exists():
            try:
                if src.is_dir():
                    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache",
                        "Service Worker", "IndexedDB", "blob_storage",
                        "File System", "shared_proto_db", "WebStorage",
                        "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except Exception:
                pass

    reqs = []

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-gpu", "--window-size=1680,1000"],
            ignore_https_errors=True, viewport={"width": 1680, "height": 1000})
        page = context.pages[0] if context.pages else await context.new_page()

        async def on_req(req):
            if ":28091/" in req.url and req.resource_type in ("xhr", "fetch"):
                try:
                    h = await req.all_headers()
                except Exception:
                    h = {}
                reqs.append({"url": req.url, "method": req.method,
                             "headers": {k: v for k, v in h.items()
                                         if k.lower() in ("authorization", "content-type", "cookie", "token", "x-token")},
                             "post": (req.post_data or "")[:300]})

        page.on("request", on_req)
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(22000)

        print("=== 真实请求头样本 ===")
        for r in reqs[:6]:
            print(r["method"], r["url"][:110])
            print("   headers:", json.dumps(r["headers"], ensure_ascii=False)[:300])
            if r["post"]:
                print("   post:", r["post"][:150])

        # 点"我的创建"触发列表请求，拿到列表接口
        try:
            await page.get_by_text("我的创建", exact=True).first.click(timeout=8000)
            await page.wait_for_timeout(9000)
            await page.screenshot(path=str(OUT / "wb_mycreation.png"))
        except Exception as e:
            print("click err:", str(e)[:100])

        print("\n=== 我的创建 之后的接口 ===")
        for r in reqs[-8:]:
            print(r["method"], r["url"][:130])
            print("   post:", r["post"][:250])

        tok = await page.evaluate("() => localStorage.getItem('token') || ''")
        tok = tok.strip('"')
        print("\nTOKEN len:", len(tok))

        # 用页面自身发请求（拦截 XHR），带 Authorization
        paths = [
            ("/BPMTask/GetCRMCreateList", {"serialNum": SERIAL, "processName": "", "description": "", "pageIndex": 1, "pageSize": 10}),
            ("/BPMTask/GetCRMTaskList", {"serialNum": SERIAL, "processName": "", "description": "", "pageIndex": 1, "pageSize": 10}),
            ("/BPMTask/GetCRMWorkOrderList", {"serialNum": SERIAL, "pageIndex": 1, "pageSize": 10}),
        ]
        js = """async ([url, body, tok]) => {
            try {
                const r = await fetch(url, {method:'POST',
                    headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
                    body: JSON.stringify(body)});
                const t = await r.text();
                return r.status + ' :: ' + t.slice(0, 600);
            } catch(e) { return 'ERR ' + e.message; }
        }"""
        for path, body in paths:
            res = await page.evaluate(js, [API + path, body, tok])
            print("\n" + "=" * 70)
            print(path, "->")
            print("  ", res.replace("\n", " ")[:650])

        Path(OUT / "reqs.json").write_text(json.dumps(reqs, ensure_ascii=False, indent=1), encoding="utf-8")
        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
