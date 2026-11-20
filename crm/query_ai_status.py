"""只读：按单号查今天那张 AI 单当前状态"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
API="https://crm.linli580.cn:28091"
URL="https://crm.linli580.cn:28092/#/admin/workflow/workbench"
PROFILE=Path.home()/".workbuddy"/"crm_profile"
JS="""async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(user_data_dir=str(PROFILE),headless=True,channel="chrome",args=["--no-sandbox","--disable-gpu"],ignore_https_errors=True,viewport={"width":1680,"height":1000})
    page=ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto(URL,wait_until="domcontentloaded",timeout=90000)
    await page.wait_for_timeout(5000)
    tok=await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
    print("TOKEN",len(tok))
    for sn in ["WX2026111800005"]:
      body={"conditions":[{"fieldName":"processName","fieldValue":"维修工单","conditionalType":0},{"fieldName":"serialNum","fieldValue":sn,"conditionalType":1}],"pageIndex":1,"pageSize":10}
      st,txt=await page.evaluate(JS,[API+"/api/Consultation/GetConsultationPage",body,tok])
      print("HTTP",st)
      j=json.loads(txt); rows=j.get("data") or []
      print("TOTAL",j.get("totalCount"))
      for r in rows:
        for k in ("serialNum","title","phaseName","orderStatusName","responsibleName","responsibleDepartmentName","createAt","closeReason","finishReason"):
          if r.get(k) not in (None,""): print("  %-22s %s"%(k,str(r.get(k))[:140]))
    await ctx.close()
asyncio.run(main())
