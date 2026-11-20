import asyncio, shutil, tempfile, json, time
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)
SERIAL = "WX2026103000226"


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

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True, channel="chrome",
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)

        ok = False
        for i in range(30):
            await page.wait_for_timeout(2000)
            n = await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
            if n > 0:
                print("表格已渲染 %d 行 (%ds)" % (n, (i+1)*2)); ok = True; break
        if not ok:
            print("❌ 表格未渲染"); await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        tab = await page.query_selector("text=我的待办")
        if tab:
            try:
                await tab.click(); await page.wait_for_timeout(2500)
            except Exception:
                pass

        found = False
        for pi in range(1, 26):
            hit = await page.evaluate("""(s)=>[...document.querySelectorAll('tr.ant-table-row')].some(r=>r.innerText.includes(s))""", SERIAL)
            if hit:
                print("第%d页找到 %s" % (pi, SERIAL)); found = True; break
            nxt = await page.query_selector("li.ant-pagination-next:not(.ant-pagination-disabled) button, .ant-pagination-next:not(.ant-pagination-disabled)")
            if not nxt:
                print("无下一页"); break
            await nxt.click(); await page.wait_for_timeout(2000)
        if not found:
            print("❌ 未找到单号"); await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        for _ in range(10):
            closed = await page.evaluate("""()=>{
                const xs=[...document.querySelectorAll('.ant-notification-close-x, .ant-notification-notice-close, .ant-message-close')];
                if(!xs.length) return false; xs.forEach(x=>x.click()); return true;}""")
            if not closed: break
            await page.wait_for_timeout(500)

        link = None
        for a in await page.query_selector_all("a"):
            try:
                if (await a.inner_text()).strip() == SERIAL:
                    link = a; break
            except Exception:
                continue
        if not link:
            print("❌ 无单号链接"); await ctx.close(); shutil.rmtree(td, ignore_errors=True); return
        try:
            async with page.expect_popup(timeout=10000) as pi:
                await link.click()
            nt = await pi.value
            print("详情页:", nt.url[:120])
        except Exception as e:
            print("popup异常:", e)

        async def find_page():
            for pp in ctx.pages:
                try:
                    has = await pp.evaluate("()=>!!([...document.querySelectorAll('button')].find(b=>((b.innerText||'').replace(/\\s+/g,'')==='分派')))")
                    if has: return pp
                except Exception:
                    continue
            return None

        pg = None; t0 = time.time()
        while time.time() - t0 < 90:
            await asyncio.sleep(2)
            pg = await find_page()
            if pg:
                print("分派按钮出现 (%ds)" % int(time.time()-t0)); break
        if pg is None:
            print("❌ 未出现分派按钮"); await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        await pg.screenshot(path=str(OUT/"py_detail.png"))
        btn = await pg.query_selector("button:has-text('分 派')")
        if not btn:
            print("❌ 未找到分派按钮"); await ctx.close(); shutil.rmtree(td, ignore_errors=True); return
        await btn.click(); await pg.wait_for_timeout(3000)
        await pg.screenshot(path=str(OUT/"py_modal.png"))

        # 弹窗结构
        info = await pg.evaluate("""()=>{
            const m=document.querySelector('.ant-modal');
            if(!m) return '无弹窗';
            return m.innerText.slice(0,600);}""")
        print("--- 弹窗文本 ---\n" + str(info))

        sel = await pg.query_selector(".ant-modal .ant-select")
        if not sel:
            print("❌ 无下拉控件"); await ctx.close(); shutil.rmtree(td, ignore_errors=True); return
        await sel.click(); await pg.wait_for_timeout(2500)

        opts = await pg.evaluate("""()=>{
            const out=[];
            document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item').forEach(el=>{
                out.push({t:(el.innerText||'').trim(), cls:el.className});
            });
            return out;}""")
        print("--- 下拉候选(%d) ---" % len(opts))
        for o in opts[:80]:
            dis = "DISABLED" if "disabled" in o["cls"] else ""
            print("  %s %s" % (o["t"], dis))
        await pg.screenshot(path=str(OUT/"py_options.png"))

        # 搜索"叶"
        await pg.keyboard.type("叶", delay=150)
        await pg.wait_for_timeout(2500)
        opts2 = await pg.evaluate("""()=>{
            const out=[];
            document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item').forEach(el=>{
                out.push({t:(el.innerText||'').trim(), cls:el.className});
            });
            return out;}""")
        print("--- 搜索『叶』结果(%d) ---" % len(opts2))
        for o in opts2[:40]:
            dis = "DISABLED" if "disabled" in o["cls"] else ""
            print("  %s %s" % (o["t"], dis))
        await pg.screenshot(path=str(OUT/"py_search_ye.png"))

        print("\n[探测结束，未提交任何分派]")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
