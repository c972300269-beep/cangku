#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打开 linli580 CRM 工作台，抓页面结构 + XHR 接口"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)
caps = []


async def main():
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_crm2_"))
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

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-gpu", "--window-size=1680,1000"],
            ignore_https_errors=True, viewport={"width": 1680, "height": 1000})
        page = context.pages[0] if context.pages else await context.new_page()

        def on_req(req):
            if req.resource_type in ("xhr", "fetch"):
                try:
                    body = req.post_data
                except Exception:
                    body = None
                caps.append({"url": req.url, "method": req.method,
                             "post": (body or "")[:400]})

        def on_resp(resp):
            for c in caps:
                if c["url"] == resp.url and "rlen" not in c:
                    c["status"] = resp.status
                    break

        page.on("request", on_req)
        page.on("response", on_resp)

        try:
            await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        except Exception as e:
            print("goto err:", e)
        await page.wait_for_timeout(15000)
        print("URL:", page.url)
        print("TITLE:", await page.title())
        await page.screenshot(path=str(OUT / "wb_1.png"), full_page=False)

        body_txt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,2500)")
        print("=== BODY TEXT ===")
        print(body_txt)

        ctl = await page.evaluate("""() => {
            const inputs = Array.from(document.querySelectorAll('input')).filter(i=>i.offsetParent!==null)
              .map(i=>({ph:i.placeholder||'', cls:(i.className||'').slice(0,60), type:i.type}));
            const btns = Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent!==null)
              .map(b=>(b.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);
            return {inputs: inputs.slice(0,20), btns: Array.from(new Set(btns)).slice(0,30)};
        }""")
        print("=== CONTROLS ===")
        print(json.dumps(ctl, ensure_ascii=False, indent=1)[:2000])

        print("=== XHR (dedup) ===")
        seen = set()
        for c in caps:
            k = c["method"] + " " + c["url"].split("?")[0]
            if k in seen:
                continue
            seen.add(k)
            print(f"  [{c.get('status','?')}] {c['method']} {c['url'][:150]}")
            if c["post"]:
                print(f"        body: {c['post'][:250]}")
        Path(OUT / "xhr.json").write_text(json.dumps(caps, ensure_ascii=False, indent=1), encoding="utf-8")
        await context.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
