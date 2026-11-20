#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 GetConsultationPage 接口逐个查询 20 个体检工单的 CRM 真实状态"""
import asyncio, shutil, tempfile, json
from pathlib import Path
from playwright.async_api import async_playwright

BOOT = "https://crm.linli580.cn:28092/#/admin/trackList/repair"
API = "https://crm.linli580.cn:28091"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
OUT = Path("E:/workbuddy/Claw/reports/crm2")

SERIALS = [
    ("香海一期", "WX2026091400235", 30000, "1-12栋外墙砖松动损坏 20点位"),
    ("香海一期", "WX2026090900303", 5000, "14/16/17商铺门前地砖 130㎡"),
    ("香海一期", "WX2026090900299", 10000, "18/19/20/15商铺门前地砖 70㎡"),
    ("香海一期", "WX2026090900288", 10000, "负一层墙面掉灰发黄 500㎡"),
    ("香海一期", "WX2026090900271", 10000, "负二层车位标识脱漆 130个"),
    ("香海一期", "WX2026090900265", 5000, "负一层车位标识脱漆 60个"),
    ("香海一期", "WX2026090900256", 30000, "防火门/机房门变形损坏 34㎡"),
    ("香海一期", "WX2026091100147", 0, "楼栋外墙砖多处脱落 20点位(重复)"),
    ("香海一期", "WX2026090900304", 0, "14/16/17商铺地砖(重复)"),
    ("香海一期", "WX2026090900278", 0, "负一层墙面掉灰(重复)"),
    ("香海一期", "WX2026090900276", 0, "负一层墙面掉灰(重复)"),
    ("香海二期", "WX2026091400205", 30000, "东西区外墙砖脱落 60方"),
    ("香海二期", "WX2026091100230", 10000, "西区商铺地面砖 50方"),
    ("香海二期", "WX2026091400201", 0, "东西区外墙砖脱落(重复)"),
    ("龙湖苑一期", "WX2026091100200", 4000, "电梯机房门生锈损坏 6㎡"),
    ("雅悦花园", "WX2026091100139", 50000, "外围商铺天面干挂墙砖 100㎡"),
    ("雅悦花园", "WX2026091100137", 3000, "2号楼2梯天面雨棚 6㎡"),
    ("雅悦花园", "WX2026091100135", 3000, "2号楼1梯天面雨棚 6㎡"),
    ("雅悦花园", "WX2026091100131", 3000, "1号楼天面雨棚 6㎡"),
    ("雅悦花园", "WX2026091100129", 20000, "地下室车场出入口雨棚 210㎡"),
]

JS = """async ([url, body, tok]) => {
    try {
        const r = await fetch(url, {method:'POST',
            headers:{'Content-Type':'application/json','authorization':tok},
            body: JSON.stringify(body)});
        return [r.status, await r.text()];
    } catch(e) { return [-1, 'ERR ' + e.message]; }
}"""


async def main():
    td = Path(tempfile.mkdtemp(prefix="chrome_crmO_"))
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
        await page.goto(BOOT, wait_until="domcontentloaded", timeout=90000)
        await page.wait_for_function("() => (document.body.innerText||'').includes('维修追踪')", timeout=90000)
        await page.wait_for_timeout(6000)
        tok = await page.evaluate("() => (localStorage.getItem('token')||'').replace(/^\"|\"$/g,'')")

        out = []
        for proj, sn, amt, desc in SERIALS:
            body = {"conditions": [
                {"fieldName": "processName", "fieldValue": "维修工单", "conditionalType": 0},
                {"fieldName": "serialNum", "fieldValue": sn, "conditionalType": 1},
            ], "pageIndex": 1, "pageSize": 10}
            st, txt = await page.evaluate(JS, [API + "/api/Consultation/GetConsultationPage", body, tok])
            j = {}
            try:
                j = json.loads(txt)
            except Exception:
                pass
            rows = j.get("data") or []
            rec = {"proj": proj, "sn": sn, "amt": amt, "desc": desc, "status": "未找到",
                   "raw": rows[0] if rows else None, "total": j.get("totalCount"), "http": st}
            if rows:
                r0 = rows[0]
                rec["status"] = "在库"
                rec["phase"] = r0.get("phaseName") or r0.get("orderStatusName") or ""
                rec["kf"] = r0.get("orderStatusName") or r0.get("phaseName") or ""
                rec["reason"] = r0.get("closeReason") or r0.get("finishReason") or ""
                rec["resp"] = r0.get("responsibleName") or ""
                rec["dept"] = r0.get("responsibleDepartmentName") or r0.get("departmentName") or ""
                rec["created"] = r0.get("createAt") or ""
                rec["title"] = (r0.get("title") or "")[:70]
            out.append(rec)
            print(f"{proj} {sn} -> {rec['status']} | {rec.get('kf','')} | {rec.get('reason','')} | {rec.get('resp','')} | {str(rec.get('created',''))[:19]}")

        Path(OUT / "all20_status.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print("\n保存 all20_status.json")
        await ctx.close()
    shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
