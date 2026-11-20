#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 C 盘 Claw 工作区的业务文件整体迁到 E 盘归档，C 盘只留 WorkBuddy 会话骨架。

E 盘主工作区已是 C 盘的完整超集（migrate_c_to_e.py --verify 通过），此处把
C 盘原件「移动」到 _C_retired 留档：C 盘文件消失、原件仍可恢复、零删除风险。

  python retire_c_workspace.py --analyze
  python retire_c_workspace.py --apply
  python retire_c_workspace.py --verify
"""
import argparse
import json
import shutil
from pathlib import Path

SRC = Path(r"C:\Users\chenjialin3\WorkBuddy\Claw")
ARCHIVE = Path(r"E:\workbuddy\Claw\_C_retired")
REPORT = Path(r"E:\workbuddy\Claw\.workbuddy\retire_report_20261105.json")

MOVE_DIRS = [
    "reports", "downloads", "output", "backups",
    ".workbuddy/scripts", ".workbuddy/tmp",
    ".workbuddy/bpm_output", ".workbuddy/tmp_pdf",
]
# .workbuddy 根下保留给 WorkBuddy 自身的文件
KEEP_ROOT_FILES = {"applications.yaml"}


def c_root_files():
    wb = SRC / ".workbuddy"
    return [p.relative_to(SRC) for p in wb.glob("*")
            if p.is_file() and p.name not in KEEP_ROOT_FILES]


def plan():
    items = []
    for rel in MOVE_DIRS:
        p = SRC / rel
        if p.is_dir():
            fs = [x for x in p.rglob("*") if x.is_file()]
            items.append({"kind": "DIR", "rel": rel, "files": len(fs),
                          "bytes": sum(x.stat().st_size for x in fs)})
    for rel in c_root_files():
        items.append({"kind": "FILE", "rel": str(rel), "files": 1,
                      "bytes": (SRC / rel).stat().st_size})
    return items


def c_remaining():
    fs = [p for p in SRC.rglob("*") if p.is_file()]
    return len(fs), sum(p.stat().st_size for p in fs), [str(p.relative_to(SRC)) for p in fs]


def do_apply(items):
    moved, failed = [], []
    for i in items:
        rel, kind = i["rel"], i["kind"]
        src, dst = SRC / rel, ARCHIVE / rel
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            moved.append(rel)
        except Exception as e:
            failed.append({"rel": rel, "err": str(e)})
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    n, size, names = c_remaining()
    REPORT.write_text(json.dumps({"moved": moved, "failed": failed,
                                  "c_remaining_files": n,
                                  "c_remaining_bytes": size,
                                  "c_remaining_names": names},
                                 ensure_ascii=False, indent=1), encoding="utf-8")
    print("迁移完成: 成功 %d 项 / 失败 %d 项" % (len(moved), len(failed)))
    print("C 盘剩余: %d 文件 / %.2f MB" % (n, size / 1048576))
    print("报告: %s" % REPORT)
    for f in failed[:10]:
        print("  ❌ %s: %s" % (f["rel"], f["err"]))
    return 0 if not failed else 2


def do_verify():
    if not REPORT.is_file():
        print("❌ 找不到报告，请先 --apply")
        return 1
    d = json.loads(REPORT.read_text(encoding="utf-8"))
    missing = [r for r in d["moved"] if not (ARCHIVE / r).exists()]
    left = [r for r in d["moved"] if (SRC / r).exists()]
    n, size, names = c_remaining()
    print("归档缺失 %d / C 盘残留待迁项 %d" % (len(missing), len(left)))
    print("C 盘当前: %d 文件 / %.2f MB" % (n, size / 1048576))
    print("C 盘剩余内容: %s" % ", ".join(names[:12]))
    ok = not missing and not left
    print("✅ 校验通过：业务文件已全部离开 C 盘，原件在 E 盘 _C_retired 可恢复"
          if ok else "❌ 校验未通过")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--analyze", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    if a.verify:
        raise SystemExit(do_verify())
    items = plan()
    print("待迁移 %d 项 / %d 文件 / %.1f MB" %
          (len(items), sum(i["files"] for i in items),
           sum(i["bytes"] for i in items) / 1048576))
    for i in items:
        print("  [%s] %-32s %5d 文件 %8.1f MB" %
              (i["kind"], i["rel"], i["files"], i["bytes"] / 1048576))
    n, size, _ = c_remaining()
    print("C 盘当前共 %d 文件 / %.1f MB；迁移后仅保留 memory / automations / applications.yaml / .genie"
          % (n, size / 1048576))
    if a.apply:
        print()
        raise SystemExit(do_apply(items))


if __name__ == "__main__":
    main()
