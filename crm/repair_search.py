#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""维修追踪：展开 -> 单号框输入 -> 查询 -> 读取结果表格；并抓列表接口"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://crm.linli580.cn:28092/#/admin/trackList/repair"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)

SERIALS = [
    "WX2026091400235", "WX2026090900256", "WX2026091100147",
    "WX2026091400205", "WX2026091100230", "WX2026091400201", "WX2026091100200",
]
caps = []


async def click(page, x, y):
    await page.mouse.move(x, y)
    await page.wait_for_timeout(220)
    await page.mouse.down()
    await page.wait_for_timeout(90)
    await page.mouse.up()


async def btn_rect(page, label):
    return await page.evaluate("""(lab) => {
        const r=[];
        document.querySelectorAll('button').forEach(b=>{
            const t=(b.innerText||'').replace(/\\s+/g,'');
            if(t===lab){const x=b.getBoundingClientRect();if(x.width>0)r.push({x:Math.round(x.x+x.width/2),y:Math.round(x.y+x.height/2)});}
        });
        return r;
    }""", label)


async def rows(page):
    return await page.evaluate("""() => {
        const out=[];
        document.querySelectorAll('table tbody tr').forEach(tr=>{
            const cells=Array.from(tr.querySelectorAll('td')).map(c=>(c.innerText||'').replace(/\\s+/g,' ').trim());
            if(cells.length>=3 && cells.join('').trim()) out.push(cells);
        });
        return out;
    }""")


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmN_"))
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
        page.on("request", lambda r: caps.append((r.method, r.url, (r.post_data or "")[:700]))
                if r.resource_type in ("xhr", "fetch") else None)

        await page.goto(BASE, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('维修追踪')", timeout=90000)
        await page.wait_for_timeout(8000)
        # 关通知
        await page.evaluate("() => {document.querySelectorAll('.ant-notification-close-icon').forEach(e=>e.click());}")
        await page.wait_for_timeout(800)

        # 展开
        await click(page, 1607, 112)
        await page.wait_for_timeout(3500)
        btns = await btn_rect(page, "查询")
        print("查询按钮:", btns)
        # 定位单号输入框（placeholder=请输入 且 y 最小者中第3列）— 用表单项 label 精确找
        box = await page.evaluate("""() => {
            const items = Array.from(document.querySelectorAll('.ant-form-item'));
            for (const fi of items) {
                const lab = (fi.querySelector('label')||{}).innerText || '';
                if (lab.trim() === '单号') {
                    const inp = fi.querySelector('input');
                    if (inp) { const r = inp.getBoundingClientRect();
                        if (r.width>0) return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; }
                }
            }
            return null;
        }""")
        print("单号输入框:", box)

        results = {}
        for sn in SERIALS:
            caps.clear()
            if box:
                await click(page, box["x"], box["y"])
                await page.wait_for_timeout(400)
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
                await page.keyboard.type(sn, delay=40)
                await page.wait_for_timeout(600)
            if btns:
                await click(page, btns[0]["x"], btns[0]["y"])
            await page.wait_for_timeout(7000)
            rs = await rows(page)
            rs = [r for r in rs if any(sn in c for c in r)]
            results[sn] = rs
            print(f"\n[{sn}] 命中行数={len(rs)}")
            for r in rs[:3]:
                print("   ", " | ".join(r)[:220])
            if not rs:
                msg = await page.evaluate("() => {const e=document.querySelector('.ant-empty-description,.ant-message'); return e?(e.innerText||'').trim().slice(0,80):'';}")
                print("    空结果提示:", msg)
        await page.screenshot(path=str(OUT / "q_last.png"))

        print("\n--- 列表接口 ---")
        seen = set()
        for m, u, b in caps:
            if "28091" in u and "/api/" in u and "Message" not in u and "ReflushToken" not in u and "Feature" not in u:
                k = m + u.split("?")[0]
                if k in seen:
                    continue
                seen.add(k)
                print(f"  {m} {u[:140]}")
                if b:
                    print("      ", b[:400])

        Path(OUT / "repair_search.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
