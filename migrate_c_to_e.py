#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""C 盘 Claw 工作区 → E 盘 Claw 工作区：合并式迁移（只复制，绝不删 C 盘）。

E 盘是实际运行版，因此：
  - C 独有文件            -> 复制到 E 对应路径
  - 两边完全相同          -> 跳过
  - 同名不同（记忆/文档）  -> 以 C 覆盖 E（C 是当前 workspace 权威）
  - 同名不同（运行脚本等）-> E 主路径保留运行版，C 版另存到 _C_overlay/<同路径>
                            保证「C 盘每个文件的字节」在 E 盘都有落点，且零破坏

用法:
  python migrate_c_to_e.py --analyze
  python migrate_c_to_e.py --apply
  python migrate_c_to_e.py --verify
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

SRC = Path(r"C:\Users\chenjialin3\WorkBuddy\Claw")
DST = Path(r"E:\workbuddy\Claw")
OVERLAY = DST / "_C_overlay"
REPORT = DST / ".workbuddy" / "migration_report_20261105.json"
SKIP_FILES = {"Thumbs.db", "desktop.ini"}

# E 盘是实际运行版：这些文件若两边不同，主路径保留 E，C 版进 _C_overlay
PROTECT = {
    ".workbuddy/scripts/run_daily_brief.cmd",
    ".workbuddy/scripts/run_daily_brief.cmd.bak_20261105",
    ".workbuddy/scripts/bpm_fetch_data.js",
    ".workbuddy/scripts/bpm_fetch_amounts.js",
    ".workbuddy/scripts/gen_bpm_brief.py",
    ".workbuddy/scripts/wecom_push_brief.py",
    ".workbuddy/scripts/crm/monitor_pool.py",
    ".workbuddy/scripts/wb_checkin/notify_mail.py",
    ".workbuddy/scripts/wb_checkin/selfheal.js",
    ".workbuddy/scripts/cleanup_stuck_processes.ps1",
    ".workbuddy/scripts/sync_password.py",
    ".workbuddy/scripts/bpm_api_test.js",
    ".workbuddy/scripts/bpm_my_initiated.js",
    ".workbuddy/scripts/crm/crm_login_try.py",
}


def norm(rel: str) -> str:
    return rel.replace("\\", "/")


def prefer_c(rel: str) -> bool:
    """记忆类与文档类以 C 为准。"""
    r = norm(rel)
    return r.startswith(".workbuddy/memory/") or r.endswith((".md", ".html", ".genie"))


def sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def src_files():
    for p in SRC.rglob("*"):
        if p.is_file() and p.name not in SKIP_FILES:
            yield p


def build_plan():
    items = []
    for p in src_files():
        rel = str(p.relative_to(SRC))
        q = DST / rel
        size = p.stat().st_size
        if not q.exists():
            items.append({"rel": rel, "act": "COPY", "size": size})
            continue
        try:
            hs, he = sha(p), sha(q)
        except OSError as e:
            items.append({"rel": rel, "act": "ERROR", "err": str(e), "size": size})
            continue
        if hs == he:
            items.append({"rel": rel, "act": "SAME"})
            continue
        r = norm(rel)
        if r in PROTECT:
            items.append({"rel": rel, "act": "OVERLAY_RUN", "size": size,
                          "e_hash_before": he, "c_hash": hs})
        elif prefer_c(rel):
            items.append({"rel": rel, "act": "OVERWRITE_C", "size": size, "e_hash_before": he})
        else:
            items.append({"rel": rel, "act": "OVERLAY_OTHER", "size": size,
                          "c_mtime": p.stat().st_mtime, "e_mtime": q.stat().st_mtime,
                          "c_hash": hs})
    return items


def summarize(items):
    from collections import Counter
    c = Counter(i["act"] for i in items)
    print("C 盘文件总数: %d" % len(items))
    for k in ("COPY", "SAME", "OVERWRITE_C", "OVERLAY_RUN", "OVERLAY_OTHER", "ERROR"):
        print("  %-14s %d" % (k, c.get(k, 0)))
    need = sum(i.get("size", 0) for i in items if i["act"] in ("COPY", "OVERWRITE_C", "OVERLAY_RUN", "OVERLAY_OTHER"))
    print("需写入字节: %.1f MB | E 盘可用: %.1f GB" % (need / 1048576, shutil.disk_usage(str(DST)).free / 1073741824))
    conflicts = [i for i in items if i["act"].startswith("OVERLAY")]
    if conflicts:
        print("\n冲突样本（前 25 条，C 版将存入 _C_overlay）:")
        for i in conflicts[:25]:
            print("  [%s] %s" % (i["act"], i["rel"]))
    return c


def do_copy(p: Path, q: Path):
    q.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, q)


def apply(items):
    need = sum(i.get("size", 0) for i in items if i["act"] in ("COPY", "OVERWRITE_C", "OVERLAY_RUN", "OVERLAY_OTHER"))
    free = shutil.disk_usage(str(DST)).free
    if need > free * 0.9:
        sys.exit("❌ E 盘空间不足，已中止")
    done = {"COPY": 0, "OVERWRITE_C": 0, "OVERLAY": 0}
    errors = []
    for i in items:
        act, rel = i["act"], i["rel"]
        if act in ("SAME", "ERROR"):
            continue
        p = SRC / rel
        try:
            if act == "COPY":
                do_copy(p, DST / rel)
                done["COPY"] += 1
            elif act == "OVERWRITE_C":
                do_copy(p, DST / rel)
                done["OVERWRITE_C"] += 1
            else:  # OVERLAY_RUN / OVERLAY_OTHER
                do_copy(p, OVERLAY / rel)
                done["OVERLAY"] += 1
        except Exception as e:
            errors.append({"rel": rel, "err": str(e)})
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({"items": items, "done": done, "errors": errors},
                                 ensure_ascii=False, indent=1), encoding="utf-8")
    print("写入完成: 新增 %d / 覆盖 %d / 冲突另存 %d / 失败 %d"
          % (done["COPY"], done["OVERWRITE_C"], done["OVERLAY"], len(errors)))
    print("报告: %s" % REPORT)
    if errors:
        for e in errors[:10]:
            print("  ❌ %s: %s" % (e["rel"], e["err"]))
        sys.exit(2)


def verify():
    if not REPORT.is_file():
        sys.exit("❌ 找不到迁移报告，请先 --apply")
    data = json.loads(REPORT.read_text(encoding="utf-8"))
    items = data["items"]
    missing, mismatch, protected_ok = [], [], 0
    for i in items:
        rel, act = i["rel"], i["act"]
        c = SRC / rel
        if act in ("COPY", "OVERWRITE_C"):
            q = DST / rel
            if not q.is_file():
                missing.append(rel)
            elif sha(c) != sha(q):
                mismatch.append(rel)
        elif act.startswith("OVERLAY"):
            q = OVERLAY / rel
            if not q.is_file():
                missing.append(rel)
            elif sha(c) != sha(q):
                mismatch.append(rel)
            if act == "OVERLAY_RUN":
                main_q = DST / rel
                if main_q.is_file() and sha(main_q) == i["e_hash_before"]:
                    protected_ok += 1
                else:
                    mismatch.append("PROTECTED_CHANGED:" + rel)
    n_src = sum(1 for _ in src_files())
    n_dst = sum(1 for p in DST.rglob("*") if p.is_file())
    print("C 盘文件 %d | E 盘文件 %d（含 _C_overlay）" % (n_src, n_dst))
    print("逐文件校验: 缺失 %d / 字节不一致 %d / 运行版哈希保持 %d" %
          (len(missing), len(mismatch), protected_ok))
    for m in (missing + mismatch)[:10]:
        print("  ⚠️ %s" % m)
    ok = not missing and not mismatch
    print("✅ 校验通过：C 盘每个文件在 E 盘都有字节相同的落点，且 E 盘运行版未被改动"
          if ok else "❌ 校验未通过")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--analyze", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    if not SRC.is_dir() or not DST.is_dir():
        sys.exit("❌ 源或目标目录不存在")
    if a.verify:
        sys.exit(verify())
    items = build_plan()
    summarize(items)
    if a.apply:
        print()
        apply(items)


if __name__ == "__main__":
    main()
