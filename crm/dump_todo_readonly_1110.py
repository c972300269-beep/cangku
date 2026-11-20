"""只读诊断：单次拉取我的待办第 1 页并逐行打印关键字段，用于核对 AI 单是否存在。"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://crm.linli580.cn:28091"
PROFILE = Path.home() / ".workbuddy" / "crm_profile"
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
        print("TOKEN_LEN", len(tok), "URL", page.url)
        if not tok or "login" in page.url.lower():
            print("LOGIN_REQUIRED")
            await ctx.close()
            return
        # 等待 SPA 表格渲染并切到「我的待办」，让 UI 侧也能核对（纯只读导航）
        tab = await page.query_selector("text=我的待办")
        if tab:
            try:
                await tab.click()
                await page.wait_for_timeout(2500)
            except Exception:
                pass
        ui_n = 0
        for _ in range(20):
            ui_n = await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
            if ui_n:
                break
            await page.wait_for_timeout(2000)
        print("UI_READY_ROWS", ui_n)
        st, txt = await page.evaluate(JS, [API + "/api/WorkOrder/GetWorkOrderTaskList",
                                           {"pageIndex": 1, "pageSize": 300, "conditions": []}, tok])
        print("HTTP", st)
        j = json.loads(txt)
        print("TOP_KEYS", list(j.keys()))
        print("TOTALCOUNT", j.get("totalCount"), "PAGE", j.get("pageIndex"), "SIZE", j.get("pageSize"), "SUCCESS", j.get("success"), "MSG", j.get("msg"))
        d = j.get("data")
        print("DATA_TYPE", type(d).__name__)
        if isinstance(d, dict):
            print("DATA_KEYS", list(d.keys()))
            print("TOTAL", d.get("total"), d.get("Total"))
            rows = d.get("list") or d.get("List") or []
        elif isinstance(d, list):
            rows = d
        else:
            rows = []
        print("ROWS", len(rows))
        for r in rows:
            if not isinstance(r, dict):
                print("ROW_NON_DICT", str(r)[:200])
                continue
            serial = str(r.get("serialNum") or r.get("SerialNum") or "")
            title = str(r.get("title") or r.get("Title") or "")
            node = str(r.get("nodeName") or r.get("NodeName") or "")
            print("ROW|%s|%s|%s|KEYS=%s" % (serial, node, title.replace("|", "／")[:140], ",".join(list(r.keys())[:18])))
        # 页面 UI 只读核对：表格行数、每行文本、含 AI 的文本、可见的 tab/菜单
        ui_rows = await page.evaluate("()=>[...document.querySelectorAll('tr.ant-table-row')].map(r=>r.innerText.replace(/\\s+/g,' ').slice(0,220))")
        print("UI_TABLE_ROWS", len(ui_rows))
        for i, t in enumerate(ui_rows, 1):
            print("UI%d|%s" % (i, t))
        ai_texts = await page.evaluate("()=>[...document.querySelectorAll('body *')].filter(e=>e.children.length===0 && (e.innerText||'').includes('AI')).map(e=>(e.innerText||'').trim().slice(0,120)).filter((v,i,a)=>a.indexOf(v)===i).slice(0,40)")
        print("AI_TEXTS", ai_texts)
        tabs = await page.evaluate("()=>[...document.querySelectorAll('.ant-tabs-tab,[role=tab],.ant-menu-item')].map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,40)")
        print("TABS", tabs)
        body_ai = await page.evaluate("()=>{const t=document.body.innerText||'';return (t.match(/.{0,40}AI.{0,60}/g)||[]).slice(0,20);}")
        print("BODY_AI_SNIPPETS", body_ai)
        # 只读查看「工单池」tab（AI 单可能尚未进入我的待办）
        pool = await page.query_selector("text=工单池")
        if pool:
            try:
                await pool.click()
                await page.wait_for_timeout(5000)
            except Exception:
                pass
        pool_rows = await page.evaluate("()=>[...document.querySelectorAll('tr.ant-table-row')].map(r=>r.innerText.replace(/\\s+/g,' ').slice(0,260))")
        print("POOL_ROWS", len(pool_rows))
        for i, t in enumerate(pool_rows, 1):
            print("POOL%d|%s" % (i, t))
        pool_ai = await page.evaluate("()=>{const t=document.body.innerText||'';return (t.match(/.{0,50}AI.{0,80}/g)||[]).slice(0,20);}")
        print("POOL_AI_SNIPPETS", pool_ai)
        await ctx.close()

asyncio.run(main())
