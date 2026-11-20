import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

WORKBENCH = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
CH   = Path.home()/"AppData"/"Local"/"Google"/"Chrome"/"User Data"
SERIAL = "WX2026102700498"

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
        await page.goto(WORKBENCH, wait_until="domcontentloaded", timeout=90000)
        # 等待工单出现
        try:
            await page.wait_for_function("()=>(document.body.innerText||'').includes('WX2026102700498')", timeout=90000)
        except Exception:
            print("超时未出现，页面摘要:", await page.evaluate("()=>document.body.innerText.slice(0,500)"))
        await page.wait_for_timeout(3000)

        # 当前URL与页面标题线索
        print("URL:", page.url)

        # 打印整行 HTML（含操作列）
        row_html = await page.evaluate("""(serial)=>{
          const rows=[...document.querySelectorAll('tr.ant-table-row')];
          for(const r of rows){ if(r.innerText.includes(serial)){ return r.outerHTML; } }
          return 'ROW_NOT_FOUND';
        }""", SERIAL)
        print("=== 待办行完整HTML ===")
        print(row_html[:6000])

        # 列出整行所有可点元素文本
        acts = await page.evaluate("""(serial)=>{
          const rows=[...document.querySelectorAll('tr.ant-table-row')];
          for(const r of rows){ if(r.innerText.includes(serial)){
            const out=[];
            r.querySelectorAll('button,a,span[class*=action],span[class*=operate],i[class*=icon],[role=button]').forEach(e=>{
              const t=(e.innerText||e.getAttribute('title')||e.getAttribute('aria-label')||'').trim(); if(t) out.push(t);
            });
            return out;
          }}
          return [];
        }""", SERIAL)
        print("=== 行内可点元素 ===")
        print(json.dumps(acts, ensure_ascii=False, indent=1))

        # 列出表头，确认操作列名
        headers = await page.evaluate("""()=>{
          const hs=[...document.querySelectorAll('thead th')].map(h=>(h.innerText||'').trim());
          return hs;
        }""")
        print("=== 表头 ===", json.dumps(headers, ensure_ascii=False))

        # 尝试点击行内"处理"文本/按钮，看是否弹出处理视图
        clicked = await page.evaluate("""(serial)=>{
          const rows=[...document.querySelectorAll('tr.ant-table-row')];
          for(const r of rows){ if(r.innerText.includes(serial)){
            // 找包含"处理"的可点元素
            const els=[...r.querySelectorAll('a,button,span,[role=button]')];
            for(const e of els){ if((e.innerText||'').trim().includes('处理')){ e.click(); return 'clicked:'+e.innerText; } }
            // 否则尝试点击行本身
            r.click(); return 'clicked-row';
          }}
          return 'notfound';
        }""", SERIAL)
        print("点击处理/行:", clicked)
        await page.wait_for_timeout(4000)
        print("点击后URL:", page.url)
        # 捕获点击后出现的弹窗/抽屉/按钮
        after = await page.evaluate("""()=>{
          const out={modals:[], buttons:[]};
          document.querySelectorAll('.ant-modal-content,.ant-drawer-content').forEach(m=>{
            out.modals.push({title:(m.querySelector('.ant-modal-title,.ant-drawer-title')||{}).innerText||'', btns:[...m.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean)});
          });
          document.querySelectorAll('button').forEach(b=>{ const t=(b.innerText||'').trim(); if(t) out.buttons.push(t); });
          return out;
        }""")
        print("=== 点击后弹窗/按钮 ===")
        print(json.dumps(after, ensure_ascii=False, indent=1))
        await page.screenshot(path="reports/crm2/workbench_after_click.png", full_page=False)

        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)

asyncio.run(main())
