import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

TRACK = "https://crm.linli580.cn:28092/#/admin/trackList/repair"
CH    = Path.home()/"AppData"/"Local"/"Google"/"Chrome"/"User Data"

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default","Local State"]:
        s = CH/it; d = td/it
        if s.exists():
            try:
                if s.is_dir(): shutil.copytree(s,d,ignore=shutil.ignore_patterns("Cache","Code Cache","GPUCache","ShaderCache","Service Worker","IndexedDB","blob_storage","File System","shared_proto_db","WebStorage","Extensions","Crashpad"),dirs_exist_ok=True)
                else: shutil.copy2(s,d)
            except Exception: pass
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(TRACK, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)

        # 所有按钮文本（含 disabled）
        btns = await page.evaluate("""()=>[...document.querySelectorAll('button,a,span[class*=link],i[class*=icon]')].map(e=>({t:(e.innerText||e.getAttribute('title')||e.getAttribute('aria-label')||'').trim(),cls:e.className.slice(0,40)})).filter(x=>x.t)""")
        print("=== 全部可点元素 ===")
        print(json.dumps(btns, ensure_ascii=False, indent=1))

        # 搜索区 inputs
        inputs = await page.evaluate("""()=>[...document.querySelectorAll('input,select,textarea')].map(i=>({ph:i.placeholder||i.name||'',cls:i.className.slice(0,50),val:i.value||''}))""")
        print("=== 全部输入控件 ===")
        print(json.dumps(inputs, ensure_ascii=False, indent=1))

        # 搜索表单区 HTML（前 3000 字）
        form_html = await page.evaluate("""()=>{
          const f=document.querySelector('form')||document.querySelector('div[class*=search],div[class*=filter],div[class*=query]');
          return f? f.outerHTML.slice(0,3000):'NO_FORM';
        }""")
        print("=== 搜索区HTML ===")
        print(form_html)
        await page.screenshot(path="reports/crm2/track_page.png", full_page=False)
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
