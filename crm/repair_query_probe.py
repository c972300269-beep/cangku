#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""维修追踪页：点展开 -> 点查询 -> 抓列表接口与返回结构"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://crm.linli580.cn:28092/#/admin/trackList/repair"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
caps = []


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmH_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache",
                        "Service Worker", "IndexedDB", "blob_storage",
                        "File System", "shared_proto_db", "WebStorage",
                        "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-gpu"],
            ignore_https_errors=True, viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        page.on("request", lambda r: caps.append((r.method, r.url, (r.post_data or "")[:600]))
                if r.resource_type in ("xhr", "fetch") else None)

        await page.goto(BASE, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('维修追踪')", timeout=90000)
        await page.wait_for_timeout(8000)
        print("URL:", page.url)

        async def click_at(x, y):
            await page.mouse.move(x, y)
            await page.wait_for_timeout(250)
            await page.mouse.down()
            await page.wait_for_timeout(100)
            await page.mouse.up()

        # 点"展开"
        for attempt in range(2):
            ex = await page.evaluate("""() => {
                const r=[];
                document.querySelectorAll('a,div,span').forEach(e=>{
                    if((e.innerText||'').trim()==='展开'){const b=e.getBoundingClientRect();
                      r.push({tag:e.tagName,x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2),w:Math.round(b.width)});}
                });
                return r;
            }""")
            print(f"展开候选 {attempt}:", json.dumps(ex, ensure_ascii=False))
            if not ex:
                break
            tgt = max(ex, key=lambda e: e["w"])
            await click_at(tgt["x"], tgt["y"])
            await page.wait_for_timeout(3000)
            n = await page.evaluate("() => document.querySelectorAll('input').length")
            print("  inputs after click:", n)
            await page.screenshot(path=str(OUT / f"q_expand_{attempt}.png"))
            if n > 8:
                break

        # dump 表单结构
        form = await page.evaluate("""() => {
            const out=[];
            document.querySelectorAll('.ant-form-item, .ant-row').forEach(fi=>{
                const lab=(fi.querySelector('label')||{}).innerText||'';
                const inp=fi.querySelector('input');
                if(inp){const r=inp.getBoundingClientRect();
                  out.push({lab:lab.trim(), ph:inp.placeholder||'', x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)});}
            });
            return out;
        }""")
        print("=== 表单项(label -> input) ===")
        for f in form[:30]:
            print("  ", json.dumps(f, ensure_ascii=False))

        # 点"查询"
        caps.clear()
        btn = await page.evaluate("""() => {
            const r=[];
            document.querySelectorAll('button').forEach(b=>{
                const t=(b.innerText||'').replace(/\\s+/g,'');
                if(t==='查询'){const x=b.getBoundingClientRect();r.push({x:Math.round(x.x+x.width/2),y:Math.round(x.y+x.height/2)});}
            });
            return r;
        }""")
        print("查询按钮:", json.dumps(btn, ensure_ascii=False))
        if btn:
            await click_at(btn[0]["x"], btn[0]["y"])
        await page.wait_for_timeout(9000)
        await page.screenshot(path=str(OUT / "q_after_query.png"))
        bt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,1500)")
        print("BODY:", bt.replace("\n", " | ")[:1000])

        print("--- 查询相关 xhr ---")
        for m, u, b in caps:
            if "28091" in u:
                print(f"  {m} {u[:140]}")
                if b:
                    print("      ", b[:400])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
