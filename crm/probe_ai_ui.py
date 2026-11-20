"""只读探查：页面打开 AI 单详情，列出所有按钮，判断能否转派"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
PROFILE=Path.home()/".workbuddy"/"crm_profile"
SERIAL="WX2026111800005"
OUT=Path("E:/workbuddy/Claw/reports/crm2")
URL="https://crm.linli580.cn:28092/#/admin/trackList/repair"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(user_data_dir=str(PROFILE),headless=True,channel="chrome",args=["--no-sandbox","--disable-gpu"],ignore_https_errors=True,viewport={"width":1680,"height":1000})
    page=ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto(URL,wait_until="domcontentloaded",timeout=90000)
    await page.wait_for_timeout(7000)
    print("URL",page.url)
    body=await page.evaluate("()=>document.body.innerText.slice(0,400)")
    print("BODY",body.replace("\n"," | ")[:400])
    # 找单号输入框
    box=await page.evaluate("""() => {
      const items=[...document.querySelectorAll('.ant-form-item')];
      for(const fi of items){const lab=(fi.querySelector('label')||{}).innerText||'';
        if(lab.trim()==='单号'){const inp=fi.querySelector('input'); if(inp){const r=inp.getBoundingClientRect(); if(r.width>0) return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}}}
      return null;}""")
    print("单号框",box)
    if box:
      await page.mouse.click(box['x'],box['y']); await page.wait_for_timeout(400)
      await page.keyboard.press("Control+a"); await page.keyboard.type(SERIAL,delay=30)
      await page.wait_for_timeout(500)
      # 查询按钮
      btns=await page.evaluate("""()=>[...document.querySelectorAll('button')].filter(b=>((b.innerText||'').replace(/\\s+/g,'')==='查询')).map(b=>{const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})""")
      print("查询按钮",btns)
      if btns: await page.mouse.click(btns[0]['x'],btns[0]['y'])
      await page.wait_for_timeout(6000)
    rows=await page.evaluate("""()=>[...document.querySelectorAll('table tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(c=>(c.innerText||'').replace(/\\s+/g,' ').trim()).join(' | '))""")
    hit=[r for r in rows if SERIAL in r]
    print("HIT",len(hit))
    for r in hit[:3]: print("  ",r[:300])
    await page.screenshot(path=str(OUT/"ai_probe_list.png"))
    # 点开命中行
    if hit:
      clicked=await page.evaluate("""(sn)=>{
        const trs=[...document.querySelectorAll('table tbody tr')];
        for(const tr of trs){if(tr.innerText.includes(sn)){const a=tr.querySelector('a'); if(a){a.click();return 'link';} tr.click();return 'row';}}
        return false;}""",SERIAL)
      print("点开",clicked)
      await page.wait_for_timeout(6000)
      print("URL2",page.url)
      # 列出所有可见按钮
      b2=await page.evaluate("""()=>[...document.querySelectorAll('button')].map(b=>(b.innerText||'').replace(/\\s+/g,'')).filter(Boolean)""")
      print("按钮",list(dict.fromkeys(b2))[:60])
      bt=await page.evaluate("()=>document.body.innerText.slice(-1200)")
      print("TAIL",bt.replace("\n"," | ")[:1200])
      await page.screenshot(path=str(OUT/"ai_probe_detail.png"),full_page=True)
    await ctx.close()
asyncio.run(main())
