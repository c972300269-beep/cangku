import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)
SERIAL = "WX2026102800167"
HANDLER = "吕飞凡"

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default", "Local State"]:
        s = CH / it; d = td / it
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
    captured = []
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        # 抓 ApprovalTask 请求体
        async def on_request(req):
            if "ApprovalTask" in req.url:
                try:
                    captured.append(req.post_data)
                except Exception:
                    pass
        page.on("request", on_request)

        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(5000)
        # 找到含单号的行并点击（应用内跳转打开处理表单）
        clicked = await page.evaluate("""(serial)=>{
            const rows=[...document.querySelectorAll('tr.ant-table-row')];
            for(const r of rows){ if(r.innerText.includes(serial)){ r.click(); return true; } }
            // 退而求其次：点单号链接
            const links=[...document.querySelectorAll('a')];
            for(const a of links){ if(a.innerText.trim()===serial){ a.click(); return 'link'; } }
            return false;
        }""", SERIAL)
        print("点击行结果:", clicked)
        await page.wait_for_timeout(6000)
        print("当前URL:", page.url)
        await page.screenshot(path=str(OUT/"ui_form.png"))

        # 找 分派 按钮并点击
        btn = await page.query_selector("button:has-text('分派')")
        if not btn:
            # 也可能在更多菜单
            print("未直接找到 分派 按钮，页面文本尾部:")
            print((await page.evaluate("()=>document.body.innerText")).replace("\\n\\n","\\n")[-500:])
        else:
            print("找到 分派 按钮，点击")
            await btn.click()
            await page.wait_for_timeout(3000)
            await page.screenshot(path=str(OUT/"ui_modal.png"))
            # 处理人：定位 处理人 表单项里的 input
            # 方式：找 label 含'处理人'的表单项，点其 input 并输入
            try:
                await page.evaluate("""()=>{
                    const labels=[...document.querySelectorAll('label,div,span')];
                    for(const l of labels){ if((l.innerText||'').trim()==='处理人'){ 
                        const item=l.closest('div.ant-form-item')||l.parentElement;
                        const inp=item.querySelector('input'); if(inp){ inp.click(); inp.focus(); return; }
                    }}
                }""")
                await page.wait_for_timeout(800)
                # 输入
                await page.keyboard.type("吕飞凡", delay=80)
                await page.wait_for_timeout(1500)
                await page.screenshot(path=str(OUT/"ui_select.png"))
                # 点下拉选项
                opt = await page.query_selector(".ant-select-dropdown:visible li:has-text('吕飞凡'), .ant-select-dropdown li:has-text('吕飞凡')")
                if opt:
                    await opt.click()
                    print("已选 吕飞凡")
                else:
                    # 试试 lvfeifan
                    await page.keyboard.press("Control+A"); await page.keyboard.type("lvfeifan", delay=80)
                    await page.wait_for_timeout(1500)
                    opt = await page.query_selector(".ant-select-dropdown li:has-text('lvfeifan')")
                    if opt:
                        await opt.click(); print("已选 lvfeifan")
                    else:
                        print("未找到吕飞凡选项，下拉HTML:")
                        print(await page.evaluate("()=>{const d=document.querySelector('.ant-select-dropdown'); return d?d.innerHTML.slice(0,600):'NO DROPDOWN';}"))
            except Exception as e:
                print("选人异常:", e)
            # 填处理说明
            try:
                await page.evaluate("""()=>{
                    const labels=[...document.querySelectorAll('label,div,span')];
                    for(const l of labels){ if((l.innerText||'').trim()==='处理说明'){
                        const item=l.closest('div.ant-form-item')||l.parentElement;
                        const ta=item.querySelector('textarea'); if(ta){ ta.focus(); ta.value='请处理';
                        ta.dispatchEvent(new Event('input',{bubbles:true})); return; }
                    }}
                }""")
                await page.keyboard.type("请处理", delay=50)
                print("已填处理说明")
            except Exception as e:
                print("填说明异常:", e)
            await page.wait_for_timeout(1000)
            await page.screenshot(path=str(OUT/"ui_before_submit.png"))
            # 点提交/确定
            sub = await page.query_selector("button:has-text('提交'), button:has-text('确定'), button:has-text('分派')")
            if sub:
                await sub.click(); print("点击提交")
                await page.wait_for_timeout(4000)
                await page.screenshot(path=str(OUT/"ui_after_submit.png"))
        print("\n--- 捕获的 ApprovalTask 请求体 ---")
        for c in captured:
            print(c[:800] if c else "空")
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
