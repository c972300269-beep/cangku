import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

TRACK = "https://crm.linli580.cn:28092/#/admin/trackList/repair"
API   = "https://crm.linli580.cn:28091"
CH    = Path.home()/"AppData"/"Local"/"Google"/"Chrome"/"User Data"
SERIAL = "WX2026102700498"
TASK_ID = 7853065
TARGET_NAME = "吕飞凡"

JS = """async ([url,body,tok])=>{
  try{ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','authorization':tok},body:JSON.stringify(body)}); return [r.status,await r.text()]; }
  catch(e){ return [-1,'ERR '+e.message]; }
}"""

async def capture_buttons(page):
    return await page.evaluate("""()=>{
      const out={buttons:[], footers:[], modals:[]};
      document.querySelectorAll('button').forEach(b=>{ const t=(b.innerText||'').trim(); if(t) out.buttons.push({t,dis:b.disabled}); });
      document.querySelectorAll('.ant-modal-content,.ant-drawer-content').forEach(m=>{
        out.modals.push({title:(m.querySelector('.ant-modal-title,.ant-drawer-title')||{}).innerText||'', btns:[...m.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean)});
      });
      const foot=[...document.querySelectorAll('div[class*=footer],div[class*=action-bar],div[class*=btn-group]')];
      out.footers=foot.map(f=>f.innerText.replace(/\\n/g,' ').slice(0,160));
      return out;
    }""")

async def main():
    td = Path(tempfile.mkdtemp(prefix="cw_"))
    for it in ["Default","Local State"]:
        s = CH/it; d = td/it
        if s.exists():
            try:
                if s.is_dir(): shutil.copytree(s,d,ignore=shutil.ignore_patterns("Cache","Code Cache","GPUCache","ShaderCache","Service Worker","IndexedDB","blob_storage","File System","shared_proto_db","WebStorage","Extensions","Crashpad"),dirs_exist_ok=True)
                else: shutil.copy2(s,d)
            except Exception: pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-gpu"],
            ignore_https_errors=True, viewport={"width":1680,"height":1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        new_page=None
        async def on_popup(pg):
            nonlocal new_page; new_page=pg
        ctx.on("page", on_popup)

        await page.goto(TRACK, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(3000)
        print("URL:", page.url)

        # 点右上角"展开"
        expanded = await page.evaluate("""()=>{
          const bs=[...document.querySelectorAll('button,span[class*=link],a')];
          for(const b of bs){ if((b.innerText||'').trim()==='展开'||(b.innerText||'').trim()==='展开筛选'){ b.click(); return true; } }
          return false;
        }""")
        print("点击展开:", expanded)
        await page.wait_for_timeout(1500)

        # 填单号搜索框（placeholder 含"单号"）
        filled = await page.evaluate("""(serial)=>{
          const inputs=[...document.querySelectorAll('input')];
          for(const i of inputs){ const ph=i.placeholder||''; if(ph.includes('单号')||ph.includes('流水号')||ph.includes('工单号')){ const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(i,serial); i.dispatchEvent(new Event('input',{bubbles:true})); return true; } }
          return false;
        }""", SERIAL)
        print("填单号:", filled)
        await page.wait_for_timeout(800)

        # 点查询
        queried = await page.evaluate("""()=>{
          const bs=[...document.querySelectorAll('button')];
          for(const b of bs){ if((b.innerText||'').trim()==='查询'){ b.click(); return true; } }
          return false;
        }""")
        print("点击查询:", queried)
        await page.wait_for_timeout(3000)

        # 列出结果行
        rows = await page.evaluate("""(serial)=>{
          const rs=[...document.querySelectorAll('tr.ant-table-row')];
          const out=[];
          for(const r of rs){ if(r.innerText.includes(serial)){ out.push(r.innerText.replace(/\\n/g,' | ')); } }
          return out;
        }""", SERIAL)
        print("结果行:", json.dumps(rows, ensure_ascii=False, indent=1))

        # 点开结果行（单号链接）
        clicked = await page.evaluate("""(serial)=>{
          const rs=[...document.querySelectorAll('tr.ant-table-row')];
          for(const r of rs){ if(r.innerText.includes(serial)){ const a=r.querySelector('a'); if(a){ a.click(); return 'serial-link'; } r.click(); return 'row'; } }
          return 'notfound';
        }""", SERIAL)
        print("点击打开:", clicked)

        # 等待目标页（可能是新标签或同页路由）
        target = page
        try:
            await ctx.wait_for_event("page", timeout=6000)
            if new_page: target=new_page
        except Exception: pass
        await target.wait_for_timeout(4000)
        print("打开后URL:", target.url)

        # 轮询按钮
        for _ in range(25):
            await target.wait_for_timeout(800)
            btns = await capture_buttons(target)
            if btns["buttons"]: break
        btns = await capture_buttons(target)
        print("=== 维修追踪点开后的操作栏 ===")
        print(json.dumps(btns, ensure_ascii=False, indent=1))
        await target.screenshot(path="reports/crm2/track_opened.png", full_page=False)

        # 找转派/分派
        def find_btn(buttons, names):
            for b in buttons:
                for n in names:
                    if n in b["t"]: return b["t"]
            return None
        transfer_btn = find_btn(btns["buttons"], ["转派","分派"])
        print("可执行:", transfer_btn)

        if transfer_btn:
            await target.evaluate("""(label)=>{
              const bs=[...document.querySelectorAll('button')];
              for(const b of bs){ if((b.innerText||'').trim().includes(label)){ b.click(); return; } }
            }""", transfer_btn)
            await target.wait_for_timeout(2500)
            modal = await target.evaluate("""()=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              if(!m) return {found:false};
              const inputs=[...m.querySelectorAll('input,textarea')].map(i=>({ph:i.placeholder||'',val:i.value||''}));
              const btns=[...m.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean);
              return {found:true,title:(m.querySelector('.ant-modal-title,.ant-drawer-title')||{}).innerText||'',inputs,btns};
            }""")
            print("=== 弹窗 ===", json.dumps(modal, ensure_ascii=False, indent=1))
            await target.screenshot(path="reports/crm2/track_modal.png", full_page=False)

            # 选人
            sel = await target.evaluate("""()=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              const sels=[...m.querySelectorAll('.ant-select')];
              for(const s of sels){ const inp=s.querySelector('input'); if(inp){ inp.focus(); inp.click(); return true; } }
              return false;
            }""")
            print("点击人员选择器:", sel)
            await target.wait_for_timeout(800)
            await target.evaluate("""(name)=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              const inp=m.querySelector('.ant-select input')||m.querySelector('input');
              if(inp){ const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(inp,name); inp.dispatchEvent(new Event('input',{bubbles:true})); }
            }""", TARGET_NAME)
            await target.wait_for_timeout(1500)
            opt = await target.evaluate("""(name)=>{
              const opts=[...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')];
              for(const o of opts){ if((o.innerText||'').includes(name)){ o.click(); return true; } }
              return false;
            }""", TARGET_NAME)
            print("选择吕飞凡:", opt)
            await target.wait_for_timeout(800)

            sub = await target.evaluate("""(label)=>{
              const m=document.querySelector('.ant-modal-content')||document.querySelector('.ant-drawer-content');
              const bs=[...m.querySelectorAll('button')];
              for(const b of bs){ if((b.innerText||'').trim()===label || (b.innerText||'').trim().includes(label)){ b.click(); return 'matched'; } }
              for(const b of bs){ if(b.className.includes('ant-btn-primary')){ b.click(); return 'primary'; } }
              return 'none';
            }""", transfer_btn)
            print("提交:", sub)
            await target.wait_for_timeout(3000)
            await target.screenshot(path="reports/crm2/track_after.png", full_page=False)
            tok = await target.evaluate("()=>(localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
            st,txt = await target.evaluate(JS,[API+"/api/WorkOrder/GetWokerOrderDetail",{"taskID":TASK_ID,"isProcess":True,"serialNum":SERIAL},tok])
            try:
                j=json.loads(txt); d=j.get("data") or {}; mi=d.get("fromData",{}).get("Flow_ConsultationMainInfo",{})
                print("=== 复核 === nodeName=",d.get("nodeName")," owner=",d.get("ownerAccount")," ResponsibleAccount=",mi.get("ResponsibleAccount")," ResponsibleName=",mi.get("ResponsibleName")," approvalButton=",d.get("approvalButton"))
            except Exception as e: print("复核失败:",e, txt[:300])
        else:
            print("未找到 转派/分派")

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
