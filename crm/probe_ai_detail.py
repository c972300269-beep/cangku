"""只读：查AI单完整字段+可用按钮"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
API="https://crm.linli580.cn:28091"
URL="https://crm.linli580.cn:28092/#/admin/workflow/workbench"
PROFILE=Path.home()/".workbuddy"/"crm_profile"
JS="""async ([url,body,tok])=>{try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});return [r.status,await r.text()];}catch(e){return[-1,'ERR '+e.message];}}"""
SN="WX2026111800005"
async def main():
  async with async_playwright() as p:
    ctx=await p.chromium.launch_persistent_context(user_data_dir=str(PROFILE),headless=True,channel="chrome",args=["--no-sandbox","--disable-gpu"],ignore_https_errors=True,viewport={"width":1680,"height":1000})
    page=ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto(URL,wait_until="domcontentloaded",timeout=90000)
    await page.wait_for_timeout(5000)
    tok=await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
    # 1) ConsultationPage 完整字段
    body={"conditions":[{"fieldName":"processName","fieldValue":"维修工单","conditionalType":0},{"fieldName":"serialNum","fieldValue":SN,"conditionalType":1}],"pageIndex":1,"pageSize":10}
    st,txt=await page.evaluate(JS,[API+"/api/Consultation/GetConsultationPage",body,tok])
    rows=json.loads(txt).get("data") or []
    print("CONSULT_ROWS",len(rows))
    if rows:
      r0=rows[0]
      for k,v in r0.items():
        if v not in (None,"",[]) : print("  C %-26s %s"%(k,str(v)[:120]))
      tid=r0.get("taskID") or r0.get("TaskID"); sid=r0.get("stepID") or r0.get("StepID")
      print("EXTRACT taskID",tid,"stepID",sid)
      # 2) GetWokerOrderDetail
      dbody={"taskID":tid,"stepID":sid,"isProcess":True,"serialNum":SN}
      st2,txt2=await page.evaluate(JS,[API+"/api/WorkOrder/GetWokerOrderDetail",dbody,tok])
      print("DETAIL_HTTP",st2)
      try:
        dd=json.loads(txt2).get("data") or {}
        for k in ("serialNum","nodeName","ownerAccount","ownerDisplayName","stepID","taskID","status","orderStatus","phaseName","processName"):
          if dd.get(k) not in (None,""): print("  D %-22s %s"%(k,str(dd.get(k))[:140]))
        for b in ("approvalButton","systemButton"):
          v=dd.get(b)
          if v: print("  D %-22s %s"%(b,json.dumps(v,ensure_ascii=False)[:500]))
      except Exception as e: print("DETAIL_PARSE_ERR",e,txt2[:200])
    await ctx.close()
asyncio.run(main())
