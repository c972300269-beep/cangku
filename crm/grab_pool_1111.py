"""工单池 AI 单：严格核对目标行按钮 -> 获取处理权 -> 复核是否进入「我的待办」。
只读探查先行；只有目标行存在文本精确为「获取处理权」的按钮才点击，否则零操作退出。
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
PROFILE = Path.home() / ".workbuddy" / "crm_profile"
OUT = Path("E:/workbuddy/Claw/reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)
SERIAL = "WX2026111100009"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox", "--disable-gpu"], ignore_https_errors=True,
            viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",
                        wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("TOKEN_LEN", len(tok), "URL", page.url, flush=True)
        if not tok or "login" in page.url.lower():
            print("LOGIN_REQUIRED"); await ctx.close(); return

        # 1) 等 SPA 表格渲染后再切到工单池（只读导航）
        init_n = 0
        for _ in range(20):
            init_n = await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
            if init_n:
                break
            await page.wait_for_timeout(2000)
        print("INIT_ROWS", init_n, flush=True)
        tabs = await page.evaluate("()=>[...document.querySelectorAll('.ant-tabs-tab,[role=tab]')].map(e=>(e.innerText||'').trim())")
        print("TABS", tabs, flush=True)
        tab = await page.query_selector("text=工单池")
        if not tab:
            print("NO_POOL_TAB"); await ctx.close(); return
        await tab.click()
        pool_n = 0
        for _ in range(15):
            await page.wait_for_timeout(1500)
            pool_n = await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
            if pool_n:
                break
        print("POOL_READY_ROWS", pool_n, flush=True)

        # 2) 只读探查：打印所有行及行内按钮
        rows = await page.evaluate("""()=>[...document.querySelectorAll('tr.ant-table-row')].map(r=>({
            text:r.innerText.replace(/\\s+/g,' ').slice(0,320),
            els:[...r.querySelectorAll('button,a')].map(b=>({tag:b.tagName,txt:(b.innerText||'').trim(),cls:String(b.className).slice(0,90)}))
        }))""")
        print("POOL_ROWS", len(rows), flush=True)
        print(json.dumps(rows, ensure_ascii=False, indent=1), flush=True)

        target = [r for r in rows if SERIAL in r["text"] and "AI自动下单" in r["text"]]
        if len(target) != 1:
            print("ABORT: 目标 AI 行数=%d（应为1），不执行任何点击" % len(target), flush=True)
            await ctx.close(); return
        btn_txts = [e["txt"] for e in target[0]["els"]]
        print("TARGET_BTNS", btn_txts, flush=True)
        if "获取处理权" not in btn_txts:
            print("ABORT: 目标行没有「获取处理权」按钮，不执行任何点击", flush=True)
            await ctx.close(); return

        # 3) 点击获取处理权（严格定位在目标行内）
        btn = None
        tr = await page.query_selector("tr.ant-table-row:has-text('%s')" % SERIAL)
        for b in await tr.query_selector_all("button, a"):
            try:
                if (await b.inner_text()).strip() == "获取处理权":
                    btn = b; break
            except Exception:
                continue
        if not btn:
            print("ABORT: 行内未定位到按钮", flush=True)
            await ctx.close(); return
        await page.screenshot(path=str(OUT / ("pool_before_%s.png" % SERIAL)))
        await btn.click()
        print("CLICKED 获取处理权", flush=True)
        await page.wait_for_timeout(3000)

        # 4) 可能出现的确认弹窗（只读查看 + 仅在明确「确定」时点击）
        modal = await page.evaluate("""()=>{const m=document.querySelector('.ant-modal:not(.ant-modal-hidden),.ant-confirm,.ant-modal-confirm');if(!m)return '';return (m.innerText||'').replace(/\\s+/g,' ').slice(0,300);}""")
        print("MODAL_TEXT", repr(modal), flush=True)
        if modal:
            ok = False
            for b in await page.query_selector_all(".ant-modal button, .ant-modal-confirm button"):
                try:
                    if (await b.inner_text()).replace(" ", "").replace("\u3000", "") in ("确定", "确认", "是"):
                        await b.click(); ok = True
                        print("CONFIRM_CLICKED", flush=True); break
                except Exception:
                    continue
            if ok:
                await page.wait_for_timeout(4000)
        await page.screenshot(path=str(OUT / ("pool_after_%s.png" % SERIAL)))

        # 5) 复核：接口 + UI 我的待办
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWorkOrderTaskList",
                                           {"pageIndex": 1, "pageSize": 300, "conditions": []}, tok])
        print("HTTP", st, flush=True)
        try:
            j = json.loads(txt)
            d = j.get("data")
            rr = d if isinstance(d, list) else (d or {}).get("list") or []
            print("TODO_TOTAL", j.get("totalCount"), "ROWS", len(rr), flush=True)
            hit = [r for r in rr if str(r.get("serialNum") or "") == SERIAL]
            print("SERIAL_IN_MY_TODO", bool(hit), flush=True)
            for r in hit:
                print("HIT_ROW", json.dumps({k: r.get(k) for k in ("serialNum", "title", "nodeName", "displayName", "displayAccount")}, ensure_ascii=False), flush=True)
        except Exception as e:
            print("PARSE_ERR", type(e).__name__, str(e)[:120], (txt or "")[:200], flush=True)
        await ctx.close()

asyncio.run(main())
