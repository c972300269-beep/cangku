#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在工单处理表单页查找 分派 按钮与责任人选择控件"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

FORM = "https://crm.linli580.cn:28092/#/form/repair?taskID=7853065&stepID=75887304&isPost=true&serialNum=WX2026102700498"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmZ_"))
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
        await page.goto(FORM, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(9000)
        try:
            await page.get_by_text("知道了", exact=True).click(timeout=3000)
            await page.wait_for_timeout(1500)
        except Exception:
            pass

        # 找含"分派"的元素
        fen = await page.evaluate("""() => Array.from(document.querySelectorAll('*')).filter(e=>{const t=(e.innerText||'').trim(); return t==='分派'||t==='汇报完成'||t==='转派';}).map(e=>{const b=e.getBoundingClientRect(); return {t:(e.innerText||'').trim(), tag:e.tagName, x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height), vis:b.width>0&&b.height>0};})""")
        print("动作按钮元素:", json.dumps(fen, ensure_ascii=False))

        # 找 责任人 相关 input/select
        resp = await page.evaluate("""() => {
            const out=[];
            document.querySelectorAll('*').forEach(e=>{
                const t=(e.innerText||'').trim();
                if((t==='责任人'||t==='责任部门') && e.children.length===0){
                    const b=e.getBoundingClientRect();
                    out.push({label:t, x:Math.round(b.x), y:Math.round(b.y)});
                }
            });
            return out;
        }""")
        print("责任人/部门标签:", json.dumps(resp, ensure_ascii=False))

        # 找所有 input/select 及其附近标签
        inputs = await page.evaluate("""() => Array.from(document.querySelectorAll('input,select')).map(i=>{const b=i.getBoundingClientRect(); return {ph:i.placeholder||i.name||'', x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), vis:b.width>0&&b.height>0, cls:(i.className||'').toString().slice(0,40)};}).filter(i=>i.vis)""")
        print("可见输入控件:")
        for i in inputs: print("  ", json.dumps(i, ensure_ascii=False))

        await page.screenshot(path=str(OUT/"form_full.png"), full_page=True)
        # 底部 footer 文本
        footer = await page.evaluate("""() => { const f=document.querySelector('.ant-layout-footer, footer, .form-footer, .action-bar'); return f? (f.innerText||'').slice(0,400):'NO FOOTER'; }""")
        print("FOOTER:", footer.replace("\n"," | "))
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(main())
