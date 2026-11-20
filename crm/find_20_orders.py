#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 CRM 里检索 20 个体检工单号：先看各列表总量，再全量拉取比对"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://crm.linli580.cn:28092/#/admin/workflow/workbench"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")
OUT.mkdir(parents=True, exist_ok=True)

SERIALS = [
    "WX2026091400235", "WX2026090900303", "WX2026090900299", "WX2026090900288",
    "WX2026090900271", "WX2026090900265", "WX2026090900256",
    "WX2026091100147", "WX2026090900304", "WX2026090900278", "WX2026090900276",
    "WX2026091400205", "WX2026091100230", "WX2026091400201",
    "WX2026091100200",
    "WX2026091100139", "WX2026091100137", "WX2026091100135", "WX2026091100131",
    "WX2026091100129",
]

LISTS = [
    ("我的创建", "/api/WorkOrder/GetMyCreateTaskList"),
    ("我的已办", "/api/WorkOrder/GetMyApprovalTaskList"),
    ("我的待办", "/api/WorkOrder/GetWorkOrderTaskList"),
    ("工单池", "/api/WorkOrder/GetShareTaskList"),
]

JS = """async ([url, body, tok]) => {
    try {
        const r = await fetch(url, {method:'POST',
            headers:{'Content-Type':'application/json','authorization':tok},
            body: JSON.stringify(body)});
        const t = await r.text();
        return [r.status, t];
    } catch(e) { return [-1, 'ERR ' + e.message]; }
}"""


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crm8_"))
    for item in ["Default", "Local State"]:
        s = CHROME_USER_DATA / item
        d = td / item
        if s.exists():
            try:
                if s.is_dir():
                    shutil.copytree(s, d, ignore=shutil.ignore_patterns(
                        "Cache", "Code Cache", "GPUCache", "ShaderCache",
                        "Service Worker", "IndexedDB", "blob_storage",
                        "File System", "shared_proto_db", "WebStorage",
                        "Extensions", "Crashpad"), dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            except Exception:
                pass

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(td), headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-gpu"],
            ignore_https_errors=True, viewport={"width": 1680, "height": 1000})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_timeout(20000)
        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")
        print("token ok", len(tok) > 100)

        # 1) 各列表总量
        print("\n=== 各列表总量 ===")
        for name, path in LISTS:
            st, txt = await page.evaluate(JS, [API + path, {"pageIndex": 1, "pageSize": 1}, tok])
            try:
                j = json.loads(txt)
                meta = {k: v for k, v in j.items() if k != "data"}
                n = len(j.get("data") or [])
                print(f"{name}: status={st} keys={list(j)} meta={json.dumps(meta, ensure_ascii=False)[:200]} rows={n}")
            except Exception as e:
                print(f"{name}: status={st} parse_err={e} txt={txt[:200]}")

        # 2) 全量拉取
        found = {}
        for name, path in LISTS:
            allrows = []
            pi = 1
            while pi <= 25:
                st, txt = await page.evaluate(JS, [API + path, {"pageIndex": pi, "pageSize": 200}, tok])
                try:
                    j = json.loads(txt)
                except Exception:
                    break
                rows = j.get("data") or []
                if not rows:
                    break
                allrows.extend(rows)
                tot = j.get("total") or j.get("totalCount") or 0
                print(f"  {name} page{pi}: +{len(rows)} (累计 {len(allrows)}/{tot})")
                if len(rows) < 200:
                    break
                if tot and len(allrows) >= tot:
                    break
                pi += 1
            Path(OUT / f"list_{name}.json").write_text(
                json.dumps(allrows, ensure_ascii=False), encoding="utf-8")
            for r in allrows:
                sn = r.get("serialNum")
                if sn in SERIALS:
                    found.setdefault(sn, []).append({"list": name, "row": r})

        print("\n=== 命中结果 ===")
        print(f"命中 {len(found)}/{len(SERIALS)}")
        for sn in SERIALS:
            if sn in found:
                for f in found[sn]:
                    r = f["row"]
                    print(f"  [OK] {sn} {f['list']} | {r.get('phaseName')} | {r.get('responsibleName')} | {r.get('createAt')} | {r.get('title','')[:60]}")
            else:
                print(f"  [--] {sn} 未找到")
        Path(OUT / "found.json").write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
