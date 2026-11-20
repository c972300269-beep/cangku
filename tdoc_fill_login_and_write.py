# -*- coding: utf-8 -*-
"""打开腾讯文档窗口等待扫码登录，登录后自动填写消费积分"""
import asyncio, shutil, tempfile, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

CH = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("reports/tdoc"); OUT.mkdir(parents=True, exist_ok=True)
URL = "https://docs.qq.com/sheet/DTVVYcFZTTXZYUEt2"
LOG = OUT / "fill_log.txt"

# (行号, 应为的姓名, 填写值) —— H列为消费积分
TARGETS = [
    (83,  "陈家林", "60"),
    (84,  "林武汉", "30"),
    (85,  "徐峻荣", "30"),
    (86,  "李锦山", "30"),
    (92,  "叶子权", "30"),
    (93,  "钟少锋", "30"),
    (118, "潘彬",   "30"),
    (119, "张泽安", "30"),
    (120, "黄键",   "30"),
    (121, "陈继亮", "30"),
    (122, "蔡伟明", "30"),
    (123, "李志敏", "30"),
]

def log(msg):
    line = "[%s] %s" % (time.strftime("%H:%M:%S"), msg)
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")

async def find_name_box(page):
    """定位左上角名称框（输入框，位于公式栏左侧）"""
    boxes = await page.evaluate("""()=>{
        const out=[];
        document.querySelectorAll('input').forEach(el=>{
          const r=el.getBoundingClientRect();
          if(r.width>10&&r.height>10&&r.y>120&&r.y<220&&r.x<300)
            out.push({x:r.x,y:r.y,w:r.width,h:r.height,ph:el.placeholder||''});
        });
        return out;}""")
    return boxes

async def goto_cell(page, ref):
    """用名称框跳转到单元格"""
    nb = await find_name_box(page)
    if not nb:
        return False
    b = nb[0]
    await page.mouse.click(b["x"]+b["w"]/2, b["y"]+b["h"]/2)
    await page.wait_for_timeout(300)
    await page.keyboard.press("Control+A")
    await page.keyboard.type(ref)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(700)
    return True

async def read_active_cell(page):
    """从编辑栏读取活动单元格内容"""
    return await page.evaluate("""()=>{
        let v='';
        document.querySelectorAll('input,textarea,[contenteditable="true"]').forEach(el=>{
          const r=el.getBoundingClientRect();
          if(r.y>120&&r.y<220&&r.x>150&&r.width>200){
            v = el.value!==undefined ? el.value : el.textContent;
          }});
        return v||'';}""")

async def main():
    LOG.unlink(missing_ok=True)
    log("=== 启动：打开文档窗口，等待扫码登录（最长8分钟）===")
    # 固定专用profile：登录一次永久保存
    td = Path.home() / ".workbuddy" / "tdoc_profile"
    td.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=False, channel="chrome",
            args=["--disable-blink-features=AutomationControlled","--no-sandbox","--start-maximized"],
            ignore_https_errors=True, viewport={"width":1600,"height":950})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(8000)
        log("窗口已打开，请在弹出的浏览器里点【登录腾讯文档】并扫码")

        # ---- 等待登录 ----
        logged = False
        for i in range(160):  # 160*3s = 8min
            await page.wait_for_timeout(3000)
            info = await page.evaluate("()=>({login: document.body.innerText.includes('登录腾讯文档')})")
            if not info["login"]:
                logged = True
                break
            if i % 10 == 9:
                log("仍未登录，继续等待... (%d/8min)" % ((i+1)*3//60))
        if not logged:
            log("RESULT=TIMEOUT 等待登录超时，未做任何修改")
            await ctx.close(); pass
            sys.exit(2)
        log("检测到登录成功！")
        await page.wait_for_timeout(4000)

        # ---- 切到 10月16-31日 标签 ----
        b = await page.evaluate("""()=>{
            const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);let r=null;
            while(walk.nextNode()){const el=walk.currentNode;
              if(el.children.length===0&&el.textContent&&el.textContent.trim()==='10月16-31日'){r=el.getBoundingClientRect();}}
            return r?{x:r.x,y:r.y,w:r.width,h:r.height}:null;}""")
        if b:
            await page.mouse.click(b["x"]+b["w"]/2, b["y"]+b["h"]/2)
            await page.wait_for_timeout(4000)
            log("已切换到「10月16-31日」工作表")
        await page.keyboard.press("Control+Home")
        await page.wait_for_timeout(1500)

        nb = await find_name_box(page)
        log("名称框定位: %s" % json.dumps(nb, ensure_ascii=False))
        if not nb:
            log("RESULT=ABORT 找不到名称框")
            await page.screenshot(path=str(OUT/"fill_err.png"))
            await ctx.close(); pass
            sys.exit(3)

        results = []
        for row, name, val in TARGETS:
            # 1) 跳到C列核姓名
            ok = await goto_cell(page, "C%d" % row)
            cur = await read_active_cell(page)
            if name not in cur:
                log("RESULT=ABORT 行%d姓名不符：期望[%s]实际[%s] —— 已中止，未写入任何值" % (row, name, cur))
                await page.screenshot(path=str(OUT/"fill_err_row%d.png" % row))
                await ctx.close(); pass
                sys.exit(4)
            # 2) 跳到H列填值
            await goto_cell(page, "H%d" % row)
            await page.keyboard.type(val)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(600)
            # 3) 回读H列验证
            await goto_cell(page, "H%d" % row)
            back = await read_active_cell(page)
            okv = (val in back)
            results.append((row, name, val, cur.strip(), back.strip(), "OK" if okv else "FAIL"))
            log("行%-4d %-4s 填%s → 回读[%s] %s" % (row, name, val, back.strip(), "✅" if okv else "❌"))
            if not okv:
                log("RESULT=PARTIAL 有回读失败，停止后续写入")
                break

        await page.screenshot(path=str(OUT/"fill_done.png"))
        fails = [r for r in results if r[5] != "OK"]
        log("RESULT=%s 成功%d/%d 失败%d" % ("ALL_OK" if not fails else "PARTIAL", len(results)-len(fails), len(TARGETS), len(fails)))
        await ctx.close()
    pass

asyncio.run(main())
