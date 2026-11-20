import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/workflow/todo"
API  = "https://crm.linli580.cn:28091"
CH   = Path.home()/"AppData"/"Local"/"Google"/"Chrome"/"User Data"
SERIAL = "WX2026102700498"
TASK_ID = 7853065
TARGET_NAME = "吕飞凡"

JS = """async ([url,body,tok])=>{
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)});
    return [r.status,await r.text()];
  }catch(e){ return [-1,'ERR '+e.message]; }
}"""

async def capture_buttons(page):
    return await page.evaluate("""()=>{
      const out={buttons:[], footers:[], bodyTail:''};
      document.querySelectorAll('button').forEach(b=>{ const t=(b.innerText||'').trim(); if(t) out.buttons.push({t,dis:b.disabled,cls:b.className.slice(0,50)}); });
      const foot=[...document.querySelectorAll('div[class*=footer],div[class*=action-bar],div[class*=btn-group],div[class*=toolbar],div[class*=operate]')];
      out.footers=foot.map(f=>({cls:f.className.slice(0,50),txt:f.innerText.replace(/\\n/g,' ').slice(0,160)}));
      out.bodyTail=document.body.innerText.replace(/\\n{2,}/g,'\\n').slice(-500);
      return out;
    }""")

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default","Local State"]:
        s = CH/it; d = td/it
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s,d,ignore=shutil.ignore_patterns("Cache","Code Cache","GPUCache","ShaderCache","Service Worker","IndexedDB","blob_storage","File System","shared_proto_db","WebStorage","Extensions","Crashpad"),dirs_exist_ok=True)
                else:
                    shutil.copy2(s,d)
            except Exception: pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})

        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        # capture popup page
        new_page = None
        async def on_popup(pg):
            nonlocal new_page
            new_page = pg
        ctx.on("page", on_popup)

        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("()=>(document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        await page.wait_for_timeout(2500)

        tok = await page.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        # 找到单号链接并点击（应用内打开工单）
        clicked = await page.evaluate("""(serial)=>{
          const rows=[...document.querySelectorAll('tr.ant-table-row')];
          for(const r of rows){
            if(r.innerText.includes(serial)){
              const a=r.querySelector('a');
              if(a){ a.click(); return true; }
            }
          }
          return false;
        }""", SERIAL)
        print("clicked serial link:", clicked)

        # 等待新页面或本页路由变化
        target = page
        try:
            await ctx.wait_for_event("page", timeout=6000)
            if new_page:
                target = new_page
                print("=> 新标签页打开工单")
        except Exception:
            print("=> 同页内路由跳转")

        # 等待表单渲染（轮询按钮出现）
        for _ in range(25):
            await target.wait_for_timeout(800)
            btns = await capture_buttons(target)
            if btns["buttons"]:
                break
        await target.wait_for_timeout(1000)
        btns = await capture_buttons(target)
        print("=== 点开工单后的操作栏 ===")
        print(json.dumps(btns, ensure_ascii=False, indent=1))
        await target.screenshot(path="reports/crm2/order_opened.png", full_page=False)

        # 找转派 / 分派 按钮
        def find_btn(buttons, names):
            for b in buttons:
                for n in names:
                    if n in b["t"]:
                        return b["t"]
            return None
        transfer_btn = find_btn(btns["buttons"], ["转派","分派"])
        print("找到的可执行按钮:", transfer_btn)

        if transfer_btn:
            # 点击该按钮
            await target.evaluate("""(label)=>{
              const bs=[...document.querySelectorAll('button')];
              for(const b of bs){ if((b.innerText||'').trim().includes(label)){ b.click(); return true; } }
              return false;
            }""", transfer_btn)
            await target.wait_for_timeout(2500)
            modal = await target.evaluate("""()=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              if(!m) return {found:false};
              const inputs=[...m.querySelectorAll('input,textarea,select')].map(i=>({ph:i.placeholder||i.name||'',val:i.value||'',cls:i.className.slice(0,40)}));
              const btns=[...m.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean);
              return {found:true, title:(m.querySelector('.ant-modal-title,.ant-drawer-title')||{}).innerText||'', inputs, buttons:btns, html:m.innerHTML.slice(0,1500)};
            }""")
            print("=== 弹窗内容 ===")
            print(json.dumps(modal, ensure_ascii=False, indent=1))
            await target.screenshot(path="reports/crm2/transfer_modal.png", full_page=False)

            # 在弹窗里选人：找到 person 选择器（antd select 带搜索）
            # 先点击选择器，输入名字
            sel_clicked = await target.evaluate("""()=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              if(!m) return false;
              // 找带搜索的 select（处理人/转派人）
              const sels=[...m.querySelectorAll('.ant-select')];
              for(const s of sels){
                const inp=s.querySelector('input');
                if(inp){ inp.focus(); inp.click(); return true; }
              }
              return false;
            }""")
            print("点击人员选择器:", sel_clicked)
            await target.wait_for_timeout(800)
            # 输入名字
            await target.evaluate("""(name)=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              const inp=m.querySelector('.ant-select input')||m.querySelector('input');
              if(inp){ const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(inp,name); inp.dispatchEvent(new Event('input',{bubbles:true})); }
            }""", TARGET_NAME)
            await target.wait_for_timeout(1500)
            # 选择下拉项
            opt_clicked = await target.evaluate("""(name)=>{
              const opts=[...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')];
              for(const o of opts){ if((o.innerText||'').includes(name)){ o.click(); return true; } }
              return false;
            }""", TARGET_NAME)
            print("选择吕飞凡选项:", opt_clicked)
            await target.wait_for_timeout(800)

            # 提交（找弹窗里的主按钮：确定/提交/转派/分派）
            submitted = await target.evaluate("""(label)=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              const bs=[...m.querySelectorAll('button')];
              // 优先点含 label 的，否则点最后一个主按钮
              for(const b of bs){ if((b.innerText||'').trim()===label || (b.innerText||'').trim().includes(label)){ b.click(); return 'matched:'+b.innerText; } }
              // 退而求其次：点 primary
              for(const b of bs){ if(b.className.includes('ant-btn-primary')){ b.click(); return 'primary:'+b.innerText; } }
              return 'none';
            }""", transfer_btn)
            print("提交结果:", submitted)
            await target.wait_for_timeout(3000)
            await target.screenshot(path="reports/crm2/after_transfer.png", full_page=False)

            # 复核：调用详情接口
            st,txt = await target.evaluate(JS,[API+"/api/WorkOrder/GetWokerOrderDetail",{"taskID":TASK_ID,"isProcess":True,"serialNum":SERIAL},tok])
            try:
                j=json.loads(txt); d=j.get("data") or {}
                mi=d.get("fromData",{}).get("Flow_ConsultationMainInfo",{})
                print("=== 复核 ===")
                print(" nodeName=",d.get("nodeName")," ownerAccount=",d.get("ownerAccount")," ownerName=",d.get("ownerName"))
                print(" ResponsibleAccount=",mi.get("ResponsibleAccount")," ResponsibleName=",mi.get("ResponsibleName"))
                print(" approvalButton=",d.get("approvalButton"))
            except Exception as e:
                print("复核解析失败:",e, txt[:300])
        else:
            print("未找到 转派/分派 按钮，结束")

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
