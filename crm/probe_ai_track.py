"""只读：用repair_search同款加载方式，在维修追踪搜AI单并点开详情列按钮"""
import asyncio, shutil, tempfile
from pathlib import Path
from playwright.async_api import async_playwright
CH=Path.home()/"AppData"/"Local"/"Google"/"Chrome"/"User Data"
OUT=Path("E:/workbuddy/Claw/reports/crm2"); OUT.mkdir(parents=True,exist_ok=True)
SERIAL="WX2026111800005"
URL="https://crm.linli580.cn:28092/#/admin/trackList/repair"
async def click(page,x,y):
    await page.mouse.move(x,y); await page.wait_for_timeout(200)
    await page.mouse.down(); await page.wait_for_timeout(80); await page.mouse.up()
async def main():
    td=Path(tempfile.mkdtemp(prefix="chrome_crmAI_"))
    for it in ["Default","Local State"]:
        s=CH/it; d=td/it
        if s.exists():
            try:
                if s.is_dir(): shutil.copytree(s,d,ignore=shutil.ignore_patterns("Cache","Code Cache","GPUCache","ShaderCache","Service Worker","IndexedDB","blob_storage","File System","shared_proto_db","WebStorage","Extensions","Crashpad"),dirs_exist_ok=True)
                else: shutil.copy2(s,d)
            except: pass
    async with async_playwright() as p:
        ctx=await p.chromium.launch_persistent_context(user_data_dir=str(td),headless=True,channel="chrome",args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],ignore_https_errors=True,viewport={"width":1680,"height":1000})
        page=ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL,wait_until="domcontentloaded",timeout=90000)
        try: await page.wait_for_function("() => (document.body.innerText||'').includes('维修追踪')",timeout=90000)
        except: print("WAIT_TIMEOUT")
        await page.wait_for_timeout(6000)
        print("BODY_LEN",len(await page.evaluate("()=>document.body.innerText")))
        # 关通知
        await page.evaluate("()=>document.querySelectorAll('.ant-notification-close-icon').forEach(e=>e.click())")
        await page.wait_for_timeout(500)
        # 展开
        await click(page,1607,112); await page.wait_for_timeout(3000)
        box=await page.evaluate("""()=>{const its=[...document.querySelectorAll('.ant-form-item')];for(const fi of its){const lab=(fi.querySelector('label')||{}).innerText||'';if(lab.trim()==='单号'){const inp=fi.querySelector('input');if(inp){const r=inp.getBoundingClientRect();if(r.width>0)return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}}}return null;}""")
        print("单号框",box)
        if box:
            await click(page,box['x'],box['y']); await page.wait_for_timeout(300)
            await page.keyboard.press("Control+a"); await page.keyboard.type(SERIAL,delay=30)
            await page.wait_for_timeout(400)
            btns=await page.evaluate("""()=>[...document.querySelectorAll('button')].filter(b=>((b.innerText||'').replace(/\\s+/g,'')==='查询')).map(b=>{const r=b.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})""")
            print("查询钮",btns)
            if btns: await click(page,btns[0]['x'],btns[0]['y'])
            await page.wait_for_timeout(6000)
        rows=await page.evaluate("""()=>[...document.querySelectorAll('table tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(c=>(c.innerText||'').replace(/\\s+/g,' ').trim()).join(' | '))""")
        hit=[r for r in rows if SERIAL in r]
        print("HIT",len(hit))
        for r in hit[:3]: print("  ",r[:300])
        if hit:
            c=await page.evaluate("""(sn)=>{const trs=[...document.querySelectorAll('table tbody tr')];for(const tr of trs){if(tr.innerText.includes(sn)){const a=tr.querySelector('a');if(a){a.click();return 'link';}tr.click();return 'row';}}return false;}""",SERIAL)
            print("点开",c); await page.wait_for_timeout(6000)
            btns2=await page.evaluate("""()=>[...document.querySelectorAll('button')].map(b=>(b.innerText||'').replace(/\\s+/g,'')).filter(Boolean)""")
            print("详情按钮",list(dict.fromkeys(btns2))[:70])
            tail=await page.evaluate("()=>document.body.innerText.slice(-1500)")
            print("TAIL",tail.replace("\n"," | ")[:1500])
            await page.screenshot(path=str(OUT/"ai_track_detail.png"),full_page=True)
        await ctx.close()
    shutil.rmtree(td,ignore_errors=True)
asyncio.run(main())
