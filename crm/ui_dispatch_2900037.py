import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)
SERIAL = "WX2026102900014"
HANDLER = "钟少锋"
HANDLER_ID = "zhongshaofeng"
COMMENT = "请处理"

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

        async def on_request(req):
            if "ApprovalTask" in req.url:
                try:
                    captured.append(req.post_data)
                except Exception:
                    pass
        page.on("request", on_request)

        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench", wait_until="domcontentloaded", timeout=90000)
        # 等待表格真正渲染（最多60s）
        rows_ok = False
        for i in range(30):
            await page.wait_for_timeout(2000)
            n = await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
            txt_len = await page.evaluate("()=>(document.body.innerText||'').length")
            if n > 0:
                rows_ok = True
                print("表格已渲染: %d 行 (等待%d秒)" % (n, (i+1)*2))
                break
            if i in (5, 15, 25):
                print("...仍在等待 (%ds, body文本%d字符, URL=%s)" % ((i+1)*2, txt_len, page.url))
        await page.screenshot(path=str(OUT/"d37_workbench.png"))
        if not rows_ok:
            print("❌ 60秒内表格未渲染，中止")
            body = await page.evaluate("()=>(document.body.innerText||'').slice(0,500)")
            print("页面文本:", body)
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        # 确保在"我的待办"tab
        tab = await page.query_selector("text=我的待办")
        if tab:
            try:
                await tab.click(); await page.wait_for_timeout(2500)
                print("已切到 我的待办 tab")
            except Exception as e:
                print("切tab异常:", e)

        # 在表格中查找目标单号，找不到则翻页（最多25页）
        found = False
        for pi in range(1, 26):
            hit = await page.evaluate("""(serial)=>{
                const rows=[...document.querySelectorAll('tr.ant-table-row')];
                for(const r of rows){ if(r.innerText.includes(serial)){ return true; } }
                return false;
            }""", SERIAL)
            if hit:
                print("第%d页找到单号" % pi); found = True; break
            # 翻下一页
            nxt = await page.query_selector("li.ant-pagination-next:not(.ant-pagination-disabled) button, .ant-pagination-next:not(.ant-pagination-disabled)")
            if not nxt:
                print("无下一页，翻页结束（共看%d页）" % pi); break
            try:
                await nxt.click(); await page.wait_for_timeout(2000)
            except Exception as e:
                print("翻页异常:", e); break
        if not found:
            print("❌ 待办表格各页均未找到 %s，放弃（不点击任何东西）" % SERIAL)
            body = await page.evaluate("()=>document.body.innerText")
            print("页面尾部:", body[-400:].replace("\n"," | "))
            await page.screenshot(path=str(OUT/"d37_notfound.png"))
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        # 关闭右侧通知弹窗（X 按钮），防遮挡
        for _ in range(10):
            closed = await page.evaluate("""()=>{
                const xs=[...document.querySelectorAll('.ant-notification-close-x, .ant-notification-notice-close, .ant-message-close')];
                if(!xs.length) return false;
                xs.forEach(x=>x.click()); return xs.length;
            }""")
            if not closed:
                break
            await page.wait_for_timeout(500)
        print("通知弹窗已清理")

        # 必须从待办列表点单号链接打开详情（直接goto URL会报 TaskID=0）
        link = None
        for a in await page.query_selector_all("a"):
            try:
                t = (await a.inner_text()).strip()
            except Exception:
                continue
            if t == SERIAL:
                link = a; break
        if not link:
            print("❌ 未找到单号链接，中止")
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return
        new_tab = None
        try:
            async with page.expect_popup(timeout=10000) as pi:
                await link.click()
            new_tab = await pi.value
            print("新标签页打开详情:", new_tab.url[:120])
        except Exception as e:
            print("popup异常:", type(e).__name__, e)

        async def find_dispatch_page():
            for p in ctx.pages:
                try:
                    has = await p.evaluate("()=>!!([...document.querySelectorAll('button')].find(b=>((b.innerText||'').replace(/\\s+/g,'')==='分派')))" )
                    if has:
                        return p
                except Exception:
                    continue
            return None

        pg = None
        import time as _t
        t0 = _t.time()
        while _t.time() - t0 < 90:
            await asyncio.sleep(2)
            pg = await find_dispatch_page()
            if pg:
                print("详情页出现分派按钮 (等待%d秒)" % int(_t.time()-t0))
                break
            if int(_t.time()-t0) % 20 == 0 and int(_t.time()-t0) > 0:
                alive = [p.url[:80] for p in ctx.pages]
                print("...等待中 (%ds) 存活页面: %s" % (int(_t.time()-t0), alive))
        if pg is None:
            print("❌ 90秒内任何页面都未出现分派按钮，中止")
            for p in ctx.pages:
                try:
                    await p.screenshot(path=str(OUT/("d37_alive_%d.png" % ctx.pages.index(p))))
                except Exception:
                    pass
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return
        print("详情URL:", pg.url[:120])

        # 找 分派 按钮（左下角操作区）
        btn = await pg.query_selector("button:has-text('分 派')")
        if not btn:
            print("未直接找到 分派 按钮，页面文本尾部:")
            print((await pg.evaluate("()=>document.body.innerText")).replace("\n\n","\n")[-500:])
            await pg.screenshot(path=str(OUT/"d37_nobtn.png"))
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return
        print("找到 分派 按钮，点击")
        await btn.click()
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path=str(OUT/"d37_modal.png"))

        # 处理人：antd Select —— 先点开下拉区域，找选项；找不到再键入搜索；再不行键盘兜底
        ok_sel = False
        sel_area = await pg.query_selector(".ant-modal .ant-select") or await pg.query_selector(".ant-modal .ant-form-item input")
        if not sel_area:
            print("❌ 弹窗内未找到处理人下拉控件，中止")
            await pg.screenshot(path=str(OUT/"d37_noinp.png"))
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        async def find_opt(kw):
            for sel in [".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item:has-text('%s')" % kw,
                        ".ant-select-dropdown .ant-select-item:has-text('%s')" % kw,
                        ".ant-select-dropdown li:has-text('%s')" % kw]:
                o = await pg.query_selector(sel)
                if o:
                    return o
            return None

        for attempt, kw in enumerate([HANDLER, HANDLER_ID], 1):
            try:
                # 1) 点开下拉
                await sel_area.click()
                await pg.wait_for_timeout(2000)
                # 2) 直接找选项（下拉可能列出全部人员）
                opt = await find_opt(kw)
                if not opt:
                    # 3) 键入搜索
                    await pg.keyboard.type(kw, delay=120)
                    await pg.wait_for_timeout(2500)
                    opt = await find_opt(kw)
                await pg.screenshot(path=str(OUT/("d37_select_%d.png" % attempt)))
                if opt:
                    await opt.click()
                    await pg.wait_for_timeout(800)
                    print("已选 %s" % kw); ok_sel = True; break
                # 4) 键盘兜底：方向键+回车
                print("第%d次未找到选项 %s，尝试键盘选择" % (attempt, kw))
                await pg.keyboard.press("ArrowDown")
                await pg.wait_for_timeout(400)
                await pg.keyboard.press("Enter")
                await pg.wait_for_timeout(1000)
                # 验证：弹窗内已选中值
                picked = await pg.evaluate("""()=>{
                    const m=document.querySelector('.ant-modal');
                    if(!m) return '';
                    const s=m.querySelector('.ant-select-selection-item, .ant-select-selection-selected-value');
                    return s?s.innerText:'';
                }""")
                print("当前选中:", picked)
                if kw in (picked or ""):
                    ok_sel = True; break
                # 重置下拉（点取消焦点）
                await pg.keyboard.press("Escape")
                await pg.wait_for_timeout(800)
            except Exception as e:
                print("选人异常(%s):" % kw, e)
        if not ok_sel:
            print("❌ 两次尝试均未选中处理人，中止提交")
            await pg.screenshot(path=str(OUT/"d37_selectfail.png"))
            await ctx.close(); shutil.rmtree(td, ignore_errors=True); return

        # 处理说明：弹窗内 textarea
        ta = await pg.query_selector(".ant-modal textarea")
        if ta:
            await ta.click()
            await ta.fill(COMMENT)
            print("已填处理说明")
        else:
            print("⚠️ 未找到处理说明 textarea")
        await pg.wait_for_timeout(1000)
        await pg.screenshot(path=str(OUT/"d37_before_submit.png"))

        # 提交：弹窗底部「确 定」（带空格）
        sub = None
        for b in await pg.query_selector_all(".ant-modal button"):
            try:
                t = (await b.inner_text()).replace("\u3000"," ").replace(" ", "")
            except Exception:
                continue
            if t == "确定":
                sub = b; break
        if sub:
            await sub.click(); print("点击确定提交")
            await pg.wait_for_timeout(6000)
            await pg.screenshot(path=str(OUT/"d37_after_submit.png"))
        else:
            print("未找到确定按钮")

        # 校验捕获的请求体
        print("\n--- 捕获的 ApprovalTask 请求体 ---")
        for c in captured:
            print(c[:1200] if c else "空")
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
