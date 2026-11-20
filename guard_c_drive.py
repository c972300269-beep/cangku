#!/usr/bin/env python3
"""Guard against new files appearing on C: (especially the retired Claw workspace).

  python guard_c_drive.py --baseline   # record the current state once
  python guard_c_drive.py --check      # report any new files / space change

Exit codes for --check: 0 = clean, 1 = new files appeared, 2 = baseline missing.
All outputs live on E:.
"""
import argparse
import datetime
import json
import pathlib
import shutil
import sys

CLAW_C = pathlib.Path(r"C:\Users\chenjialin3\WorkBuddy\Claw")
APPDATA = pathlib.Path(r"C:\Users\chenjialin3\.workbuddy")
BASELINE = pathlib.Path(r"E:\workbuddy\Claw\.workbuddy\c_drive_baseline.json")
REPORT = pathlib.Path(r"E:\workbuddy\Claw\.workbuddy\c_drive_guard_report.json")

# App data folders that WorkBuddy keeps growing (not AI-produced business files).
GROWTH_DIRS = [
    "projects", "logs", "workspace", "traces", "tmp", "blobs",
    "changes-detail", "changes-index", "file-history", "shell-snapshots",
    "buddy-snapshots", "clipboard-images", "audit-log", "artifact-index",
    "cache", "storage", "tasks", "file-tree-manifests",
]


def disk_free():
    return shutil.disk_usage("C:\\").free


def claw_files():
    if not CLAW_C.exists():
        return []
    return sorted(
        str(p.relative_to(CLAW_C)) for p in CLAW_C.rglob("*") if p.is_file()
    )


def growth_size():
    total, count = 0, 0
    for name in GROWTH_DIRS:
        d = APPDATA / name
        if not d.exists() or d.is_symlink():
            continue
        for p in d.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                    count += 1
                except OSError:
                    pass
    return total, count


def snapshot():
    total, count = growth_size()
    return {
        "recorded_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "claw_c_files": claw_files(),
        "c_free_bytes": disk_free(),
        "appdata_growth_bytes": total,
        "appdata_growth_files": count,
        "note": "After the workspace switch, the C: Claw folder must stay at this file list.",
    }


def do_baseline():
    snap = snapshot()
    BASELINE.write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    print("baseline ->", BASELINE)
    print("C: Claw files =", len(snap["claw_c_files"]))
    print("C: free = {:.2f} GB".format(snap["c_free_bytes"] / 1024 ** 3))
    print("appdata growth dirs = {:.1f} MB / {} files".format(
        snap["appdata_growth_bytes"] / 1024 ** 2, snap["appdata_growth_files"]))
    return 0


def do_check():
    if not BASELINE.exists():
        print("ERROR: run --baseline first")
        return 2
    base = json.loads(BASELINE.read_text(encoding="utf-8"))
    now = snapshot()
    old = set(base["claw_c_files"])
    cur = set(now["claw_c_files"])
    added = sorted(cur - old)
    removed = sorted(old - cur)
    free_delta = now["c_free_bytes"] - base["c_free_bytes"]
    grow_delta = now["appdata_growth_bytes"] - base["appdata_growth_bytes"]
    out = {
        "checked_at": now["recorded_at"],
        "baseline_at": base["recorded_at"],
        "claw_c_new_files": added,
        "claw_c_removed_files": removed,
        "claw_c_file_count": [len(old), len(cur)],
        "c_free_delta_mb": round(free_delta / 1024 ** 2, 1),
        "appdata_growth_delta_mb": round(grow_delta / 1024 ** 2, 1),
        "c_free_now_gb": round(now["c_free_bytes"] / 1024 ** 3, 2),
    }
    REPORT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("C: Claw file count {0} -> {1}".format(*out["claw_c_file_count"]))
    print("C: free now {:.2f} GB (delta {:+.1f} MB)".format(
        out["c_free_now_gb"], out["c_free_delta_mb"]))
    print("appdata growth dirs delta {:+.1f} MB".format(out["appdata_growth_delta_mb"]))
    if added:
        print("!! NEW FILES ON C: CLAW ({})".format(len(added)))
        for p in added[:30]:
            print("   +", p)
    if removed:
        print("   removed {} files (expected if the retired folder was cleaned)".format(len(removed)))
    print("report ->", REPORT)
    return 1 if added else 0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--baseline", action="store_true")
    g.add_argument("--check", action="store_true")
    a = ap.parse_args()
    return do_baseline() if a.baseline else do_check()


if __name__ == "__main__":
    sys.exit(main())
