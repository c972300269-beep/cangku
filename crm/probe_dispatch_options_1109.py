"""只读诊断：打开指定工单的「分派」弹窗，枚举处理人下拉的全部选项。
不提交、不修改任何工单。用于确认「林桂光」是否在可派人员列表中。
用法: py probe_dispatch_options_1109.py WX2026110900063
"""
import asyncio, sys
from pathlib import Path
from playwright.async_api import async_playwright

SERIAL = sys.argv[1] if len(sys.argv) > 1 else "WX2026110900063"
PROFILE = Path.home() / ".workbuddy" / "crm_profile"
OUT = Path("E:/workbuddy/Claw/reports/crm2"); OUT.mkdir(parents=True, exist_ok=True)


async def dump(pg, label):
    items = await pg.evaluate("""()=>{
        const ds=[...document.querySelectorAll('.ant-select-dropdown')];
        const out=[];
        for(const d of ds){
            if(d.classList.contains('ant-select-dropdown-hidden')) continue;
            for(const el of d.querySelectorAll('.ant-select-item, li')){
                const t=(el.innerText||'').trim();
                if(t) out.push({text:t, cls:el.className, title:el.getAttribute('title')||''});
            }
        }
        return out;
    }""")
    print("  [%s] 下拉可见选项 %d 项:" % (label, len(items)), flush=True)
    for it in items:
        print("     - %s | %s" % (it["text"], it["cls"]), flush=True)
    return items


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE), headless=True, channel="chrome",
            args=["--no-sandbox", "--disable-gpu"], ignore_https_errors=True,
            viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",
                        wait_until="domcontentloaded", timeout=90000)
        for _ in range(25):
            await page.wait_for_timeout(2000)
            if await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length") > 0:
                break
        tab = await page.query_selector("text=我的待办")
        if tab:
            try:
                await tab.click(); await page.wait_for_timeout(2500)
            except Exception:
                pass

        found = False
        for pi in range(1, 26):
            if await page.evaluate("(s)=>{for(const r of document.querySelectorAll('tr.ant-table-row')){if(r.innerText.includes(s))return true;}return false;}", SERIAL):
                found = True; break
            nxt = await page.query_selector("li.ant-pagination-next:not(.ant-pagination-disabled) button, .ant-pagination-next:not(.ant-pagination-disabled)")
            if not nxt: break
            try:
                await nxt.click(); await page.wait_for_timeout(2000)
            except Exception:
                break
        if not found:
            print("未找到单号 %s" % SERIAL); await ctx.close(); return
        print("第 %d 页找到单号" % pi, flush=True)

        for _ in range(8):
            closed = await page.evaluate("""()=>{const xs=[...document.querySelectorAll('.ant-notification-close-x,.ant-notification-notice-close,.ant-message-close')];if(!xs.length)return false;xs.forEach(x=>x.click());return true;}""")
            if not closed: break
            await page.wait_for_timeout(400)

        link = None
        for a in await page.query_selector_all("a"):
            try:
                if (await a.inner_text()).strip() == SERIAL:
                    link = a; break
            except Exception:
                continue
        if not link:
            print("未找到单号链接"); await ctx.close(); return
        try:
            async with page.expect_popup(timeout=15000) as pi2:
                await link.click()
            await pi2.value
        except Exception as e:
            print("popup异常:", type(e).__name__, flush=True)

        async def find_detail():
            for q in ctx.pages:
                if q is page: continue
                try:
                    if await q.evaluate("()=>!!([...document.querySelectorAll('button')].find(b=>((b.innerText||'').replace(/\\s+/g,'')==='分派')))"):
                        return q
                except Exception:
                    continue
            return None

        pg = None
        for _ in range(45):
            await asyncio.sleep(2)
            pg = await find_detail()
            if pg: break
        if pg is None:
            print("详情页未就绪"); await ctx.close(); return
        print("详情页已就绪", flush=True)

        btn = await pg.query_selector("button:has-text('分 派')")
        if not btn:
            print("未找到分派按钮"); await ctx.close(); return
        await btn.click(); await pg.wait_for_timeout(3000)

        sel = await pg.query_selector(".ant-modal .ant-select")
        print("处理人控件:", await pg.evaluate("""()=>{const m=document.querySelector('.ant-modal');if(!m)return 'no modal';const s=m.querySelector('.ant-select');return s?s.outerHTML.slice(0,600):'no select';}"""), flush=True)
        if not sel:
            await pg.screenshot(path=str(OUT / "probe_no_select.png")); await ctx.close(); return

        await sel.click(); await pg.wait_for_timeout(2500)
        await dump(pg, "展开后")
        await pg.screenshot(path=str(OUT / "probe_options_open.png"))

        try:
            await pg.keyboard.type("林", delay=150)
            await pg.wait_for_timeout(2000)
            await dump(pg, "键入 林 之后")
            await pg.screenshot(path=str(OUT / "probe_options_keyword.png"))
        except Exception as e:
            print("键入异常:", e, flush=True)

        try:
            inp = await pg.query_selector(".ant-modal .ant-select input")
            if inp:
                await inp.fill("林桂光")
                await pg.wait_for_timeout(2000)
                await dump(pg, "填入 林桂光 之后")
                await pg.screenshot(path=str(OUT / "probe_options_fullname.png"))
        except Exception as e:
            print("填入异常:", e, flush=True)

        print("诊断结束（未点击确定，工单未改动）", flush=True)
        await ctx.close()

asyncio.run(main())
