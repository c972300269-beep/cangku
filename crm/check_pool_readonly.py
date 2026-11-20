"""只读：查工单池当前所有行，重点看AI自动下单单"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
PROFILE=Path.home()/".workbuddy"/"crm_profile"
OUT=Path("E:/workbuddy/Claw/reports/crm2")
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(user_data_dir=str(PROFILE),headless=True,channel="chrome",args=["--no-sandbox","--disable-gpu"],ignore_https_errors=True,viewport={"width":1680,"height":1000})
    page=ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto("https://crm.linli580.cn:28092/#/admin/workflow/workbench",wait_until="domcontentloaded",timeout=90000)
    await page.wait_for_timeout(6000)
    n=0
    for _ in range(15):
      n=await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
      if n: break
      await page.wait_for_timeout(1500)
    print("INIT_ROWS",n,flush=True)
    tab=await page.query_selector("text=工单池")
    print("POOL_TAB",bool(tab),flush=True)
    if tab:
      await tab.click()
      pn=0
      for _ in range(12):
        await page.wait_for_timeout(1500)
        pn=await page.evaluate("()=>document.querySelectorAll('tr.ant-table-row').length")
        if pn: break
      print("POOL_ROWS",pn,flush=True)
      rows=await page.evaluate("""()=>[...document.querySelectorAll('tr.ant-table-row')].map(r=>({t:r.innerText.replace(/\\s+/g,' ').slice(0,260),btn:[...r.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean)}))""")
      for r in rows:
        mark="AI" if "AI自动下单" in r['t'] else "  "
        print(mark,"|",r['t'][:200],"| BTN",r['btn'],flush=True)
      await page.screenshot(path=str(OUT/"pool_check.png"))
    await ctx.close()
asyncio.run(main())
