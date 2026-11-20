"""CRM AI工单批量分派（UI 真实弹窗选人 + 提交后接口复核）
用法: python ui_dispatch_batch.py SERIAL1:姓名:账号 SERIAL2:姓名:账号 ...
"""
import asyncio, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

PROFILE = Path.home() / ".workbuddy" / "crm_profile"
OUT = Path("E:/workbuddy/Claw/reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)
API = "https://crm.linli580.cn:28091"
COMMENT = "请处理"
JS = """async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""

TASKS = []
for a in sys.argv[1:]:
    p = a.split(":")
    if len(p) >= 3:
        TASKS.append({"serial": p[0], "name": p[1], "acct": p[2]})


async def find_opt(pg, kw):
    # 该控件是 ant-pro-filed-search-select：选项为异步加载，且键入关键字会返回 0 项。
    # 因此不能依赖 :has-text 或输入搜索，必须轮询等待选项渲染后按 DOM 文本精确匹配。
    for _ in range(12):
        n = await pg.evaluate("()=>document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item').length")
        if n:
            break
        await pg.wait_for_timeout(1000)
    items = await pg.query_selector_all(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item")
    for o in items:
        try:
            t = (await o.inner_text()).strip()
            if t and (t == kw or kw in t):
                return o
        except Exception:
            continue
    return None


async def dispatch_one(ctx, page, tok, t):
    serial, name, acct = t["serial"], t["name"], t["acct"]
    print("\n===== %s -> %s(%s) =====" % (serial, name, acct), flush=True)

    # 1) 回到我的待办
    await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",
                    wait_until="domcontentloaded", timeout=90000)
    ok_rows = False
    for _ in range(25):
        await page.wait_for_timeout(2000)
        n = await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
        if n > 0:
            ok_rows = True; break
    if not ok_rows:
        print("  ❌ 待办表格未渲染", flush=True); return False
    tab = await page.query_selector("text=我的待办")
    if tab:
        try:
            await tab.click(); await page.wait_for_timeout(2500)
        except Exception: pass

    # 2) 翻页找单号
    found = False
    for pi in range(1, 26):
        hit = await page.evaluate("""(s)=>{for(const r of document.querySelectorAll('tr.ant-table-row')){if(r.innerText.includes(s))return true;}return false;}""", serial)
        if hit:
            found = True; break
        nxt = await page.query_selector("li.ant-pagination-next:not(.ant-pagination-disabled) button, .ant-pagination-next:not(.ant-pagination-disabled)")
        if not nxt: break
        try:
            await nxt.click(); await page.wait_for_timeout(2000)
        except Exception: break
    if not found:
        print("  ❌ 待办各页未找到该单号", flush=True); return False
    print("  第%d页找到单号" % pi, flush=True)

    # 3) 清理通知弹窗
    for _ in range(8):
        closed = await page.evaluate("""()=>{const xs=[...document.querySelectorAll('.ant-notification-close-x,.ant-notification-notice-close,.ant-message-close')];if(!xs.length)return false;xs.forEach(x=>x.click());return true;}""")
        if not closed: break
        await page.wait_for_timeout(400)

    # 4) 点单号链接 -> popup
    link = None
    for a in await page.query_selector_all("a"):
        try:
            if (await a.inner_text()).strip() == serial:
                link = a; break
        except Exception: continue
    if not link:
        print("  ❌ 未找到单号链接", flush=True); return False
    detail = None
    try:
        async with page.expect_popup(timeout=15000) as pi:
            await link.click()
        detail = await pi.value
    except Exception as e:
        print("  popup异常:", type(e).__name__, flush=True)

    async def find_detail():
        for p in ctx.pages:
            if p is page: continue
            try:
                has = await p.evaluate("()=>!!([...document.querySelectorAll('button')].find(b=>((b.innerText||'').replace(/\\s+/g,'')==='分派')))")
                if has: return p
            except Exception: continue
        return None

    pg = None
    t0 = time.time()
    while time.time() - t0 < 90:
        await asyncio.sleep(2)
        pg = await find_detail()
        if pg: break
    if pg is None:
        print("  ❌ 90秒内未出现分派按钮", flush=True); return False
    print("  详情页已就绪 (%ds)" % int(time.time()-t0), flush=True)

    # 5) 分派
    btn = await pg.query_selector("button:has-text('分 派')")
    if not btn:
        print("  ❌ 未找到分派按钮", flush=True); return False
    await btn.click(); await pg.wait_for_timeout(3000)

    sel_area = await pg.query_selector(".ant-modal .ant-select") or await pg.query_selector(".ant-modal .ant-form-item input")
    if not sel_area:
        print("  ❌ 弹窗未出现处理人控件", flush=True); return False

    ok_sel = False
    for kw in [name, acct]:
        try:
            await sel_area.click(); await pg.wait_for_timeout(2000)
            opt = await find_opt(pg, kw)
            if opt:
                await opt.click(); await pg.wait_for_timeout(1000)
                print("  已选 %s" % kw, flush=True); ok_sel = True; break
            picked = await pg.evaluate("""()=>{const m=document.querySelector('.ant-modal');if(!m)return'';const s=m.querySelector('.ant-select-selection-item,.ant-select-selection-selected-value');return s?s.innerText:'';}""")
            print("  未找到选项 %s（当前选中:%s）" % (kw, picked), flush=True)
            if name[:3] in (picked or ""):
                ok_sel = True; break
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(600)
        except Exception as e:
            print("  选人异常:", e, flush=True)
    if not ok_sel:
        await pg.screenshot(path=str(OUT/("batch_fail_%s.png" % serial)))
        print("  ❌ 未选中处理人，本单中止", flush=True); return False

    # 确认选中值确实是目标人
    picked = await pg.evaluate("""()=>{const m=document.querySelector('.ant-modal');if(!m)return'';const s=m.querySelector('.ant-select-selection-item,.ant-select-selection-selected-value');return s?s.innerText:'';}""")
    if name not in (picked or ""):
        await pg.screenshot(path=str(OUT/("batch_mismatch_%s.png" % serial)))
        print("  ❌ 选中值(%s)与目标(%s)不符，中止" % (picked, name), flush=True); return False
    print("  确认选中: %s" % picked, flush=True)

    ta = await pg.query_selector(".ant-modal textarea")
    if ta:
        await ta.click(); await ta.fill(COMMENT)
    else:
        print("  ⚠️ 未找到处理说明输入框", flush=True)
    await pg.wait_for_timeout(800)
    await pg.screenshot(path=str(OUT/("batch_before_%s.png" % serial)))

    sub = None
    for b in await pg.query_selector_all(".ant-modal button"):
        try:
            if (await b.inner_text()).replace("\u3000", " ").replace(" ", "") == "确定":
                sub = b; break
        except Exception: continue
    if not sub:
        print("  ❌ 未找到确定按钮", flush=True); return False
    await sub.click()
    print("  已点击确定，等待提交", flush=True)
    await pg.wait_for_timeout(6000)
    await pg.screenshot(path=str(OUT/("batch_after_%s.png" % serial)))

    # 6) 接口复核
    await asyncio.sleep(2)
    st, txt = await page.evaluate(JS, [API+"/api/WorkOrder/GetWorkOrderTaskList", {"pageIndex":1,"pageSize":300,"conditions":[]}, tok])
    still = serial in (txt or "")
    print("  复核: 该单是否仍在待办列表 -> %s" % ("是" if still else "否(已流出)"), flush=True)

    # 关闭详情页
    try:
        if pg: await pg.close()
    except Exception: pass
    return True


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox","--disable-gpu"], ignore_https_errors=True,
            viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",
                        wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        if not tok or "login" in page.url.lower():
            print("LOGIN_REQUIRED"); await ctx.close(); return
        res = []
        for t in TASKS:
            try:
                r = await dispatch_one(ctx, page, tok, t)
            except Exception as e:
                print("  异常:", type(e).__name__, e, flush=True); r = False
            finally:
                # 无论成功失败都关掉详情页/弹窗，避免残留 modal 拦截下一单的点击
                for q in list(ctx.pages):
                    if q is not page:
                        try: await q.close()
                        except Exception: pass
            res.append((t["serial"], t["name"], r))
        print("\n===== 汇总 =====")
        for s, n, r in res:
            print("  %s -> %s : %s" % (s, n, "已提交" if r else "未完成"))
        await ctx.close()

asyncio.run(main())
