"""只读：工作台页面列出tabs/搜索框/各tab表格行，找AI单入口"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
PROFILE=Path.home()/".workbuddy"/"crm_profile"
OUT=Path("E:/workbuddy/Claw/reports/crm2")
URL="https://crm.linli580.cn:28092/#/admin/workflow/workbench"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(user_data_dir=str(PROFILE),headless=True,channel="chrome",args=["--no-sandbox","--disable-gpu"],ignore_https_errors=True,viewport={"width":1680,"height":1000})
    page=ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto(URL,wait_until="domcontentloaded",timeout=90000)
    await page.wait_for_timeout(7000)
    # tabs
    tabs=await page.evaluate("""()=>[...document.querySelectorAll('.ant-tabs-tab,[role=tab],.ant-menu-item')].map(e=>(e.innerText||'').trim()).filter(Boolean)""")
    print("TABS",list(dict.fromkeys(tabs))[:40])
    # inputs placeholder
    ins=await page.evaluate("""()=>[...document.querySelectorAll('input')].filter(i=>i.offsetWidth>0).map(i=>({ph:i.placeholder||'',val:i.value||''}))""")
    print("INPUTS",ins[:20])
    # 当前各表格行
    for i in range(3):
      rows=await page.evaluate("""()=>[...document.querySelectorAll('tr.ant-table-row')].map(r=>r.innerText.replace(/\\s+/g,' ').slice(0,150))""")
      print("TAB_ROWS%d"%i,len(rows))
      for r in rows[:3]: print("   ",r[:150])
      # 切下一个tab
      alltabs=await page.query_selector_all(".ant-tabs-tab,[role=tab]")
      if i<len(alltabs):
        try: await alltabs[i+1].click(); await page.wait_for_timeout(3500)
        except: pass
    await page.screenshot(path=str(OUT/"workbench_probe.png"))
    await ctx.close()
asyncio.run(main())
