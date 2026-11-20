#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""点击左侧"服务追踪"展开子菜单 -> 进"维修追踪" -> 右上"展开" -> dump 控件"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)
caps = []


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmG_"))
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
        page.on("request", lambda r: caps.append((r.method, r.url, (r.post_data or "")[:400]))
                if r.resource_type in ("xhr", "fetch") else None)

        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('工作台')", timeout=90000)
        await page.wait_for_timeout(3000)

        # 1) 点击"服务追踪" submenu title（精确坐标）
        await page.mouse.move(104, 456)
        await page.wait_for_timeout(400)
        await page.mouse.down()
        await page.mouse.up()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(OUT / "v_1_submenu.png"))

        subs = await page.evaluate("""() => {
            const out=[];
            document.querySelectorAll('.ant-menu-item, a').forEach(e=>{
                const t=(e.innerText||'').replace(/\\s+/g,' ').trim();
                const r=e.getBoundingClientRect();
                if(t && t.length<=12 && r.width>0 && r.x<400) out.push({t,tag:e.tagName,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),href:e.getAttribute('href')||''});
            });
            return out;
        }""")
        print("=== 子菜单 ===")
        for s in subs:
            print("  ", json.dumps(s, ensure_ascii=False))

        # 2) 点"维修追踪"
        tgt = [s for s in subs if s["t"] == "维修追踪"]
        if tgt:
            t0 = tgt[0]
            await page.mouse.move(t0["x"] + t0["w"] / 2, t0["y"] + t0["h"] / 2)
            await page.wait_for_timeout(300)
            await page.mouse.down()
            await page.mouse.up()
            print("clicked 维修追踪 at", t0["x"], t0["y"])
        else:
            print("!! 未找到 维修追踪 子项")
        await page.wait_for_timeout(9000)
        print("URL:", page.url)
        bt = await page.evaluate("() => (document.body.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,2500)")
        print("BODY:", bt.replace("\n", " | ")[:1500])
        await page.screenshot(path=str(OUT / "v_2_repair.png"))

        # 3) 右上角"展开"
        ex = await page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('*')).filter(e=>{
                const t=(e.innerText||'').trim();
                return (t==='展开'||t==='展开搜索'||t==='收起') && e.children.length<=1;
            });
            return els.map(e=>{const r=e.getBoundingClientRect();return {t:(e.innerText||'').trim(),tag:e.tagName,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};});
        }""")
        print("=== 展开按钮候选 ===", json.dumps(ex, ensure_ascii=False)[:500])
        if ex:
            e0 = ex[0]
            await page.mouse.move(e0["x"] + e0["w"] / 2, e0["y"] + e0["h"] / 2)
            await page.wait_for_timeout(300)
            await page.mouse.down()
            await page.mouse.up()
            await page.wait_for_timeout(3000)
            print("clicked 展开")
        await page.screenshot(path=str(OUT / "v_3_expand.png"))

        info = await page.evaluate("""() => {
            const ins = Array.from(document.querySelectorAll('input')).filter(i=>i.offsetParent!==null)
              .map((i,idx)=>{const r=i.getBoundingClientRect();return {idx, ph:i.placeholder||'', cls:(i.className||'').toString().slice(0,45), x:Math.round(r.x), y:Math.round(r.y)};});
            const btns = Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent!==null)
              .map(b=>(b.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);
            const ths = Array.from(document.querySelectorAll('th')).map(t=>(t.innerText||'').trim()).filter(Boolean);
            return {inputs: ins.slice(0,25), buttons: Array.from(new Set(btns)).slice(0,25), ths: ths.slice(0,20)};
        }""")
        print("=== INPUTS ===", json.dumps(info["inputs"], ensure_ascii=False)[:1000])
        print("=== BUTTONS ===", json.dumps(info["buttons"], ensure_ascii=False)[:500])
        print("=== THS ===", json.dumps(info["ths"], ensure_ascii=False)[:500])

        print("--- xhr ---")
        seen = set()
        for m, u, b in caps:
            if "28091" in u:
                k = m + u.split("?")[0]
                if k in seen:
                    continue
                seen.add(k)
                print(f"  {m} {u[:130]}")
                if b:
                    print("      ", b[:250])
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
