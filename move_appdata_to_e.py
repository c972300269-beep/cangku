#!/usr/bin/env python3
"""Stop C: from growing by relocating WorkBuddy's growing data folders to E:.

The original C: paths remain valid NTFS junctions, so WorkBuddy and all scripts
keep working unchanged while every future byte is written on E:.

IMPORTANT: WorkBuddy must be fully quit before --apply. The script refuses to
run while WorkBuddy.exe exists. Nothing is deleted: the old folders are renamed
to <name>__retired_<timestamp> on C: and can be restored with --rollback.

  python move_appdata_to_e.py --analyze   # read-only sizes / free space
  python move_appdata_to_e.py --apply     # copy -> verify -> rename -> junction
  python move_appdata_to_e.py --verify    # read-only state check
  python move_appdata_to_e.py --rollback  # remove junctions, restore C: folders
  python move_appdata_to_e.py --purge     # (optional, 2nd confirmation) recycle retired folders
"""
import argparse
import datetime
import json
import os
import pathlib
import shutil
import subprocess
import sys

HOME = pathlib.Path(r"C:\Users\chenjialin3\.workbuddy")
DEST = pathlib.Path(r"E:\workbuddy\Claw\_appdata")
REPORT = pathlib.Path(r"E:\workbuddy\Claw\.workbuddy\appdata_move_report.json")

# Growing data folders only. Program runtime (binaries/app/plugins), databases,
# settings.json and user skills are deliberately NOT touched.
DIRS = [
    "projects", "logs", "workspace", "traces", "tmp", "blobs",
    "changes-detail", "changes-index", "file-history", "shell-snapshots",
    "buddy-snapshots", "clipboard-images", "audit-log", "artifact-index",
    "cache", "storage", "tasks", "file-tree-manifests",
]


def is_junction(p):
    fn = getattr(os.path, "isjunction", None)
    return bool(fn(p)) if fn else p.is_symlink()


def app_running():
    try:
        r = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq WorkBuddy.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, errors="ignore", timeout=20,
        )
        return "WorkBuddy.exe" in (r.stdout or "")
    except Exception:
        return True  # conservative: treat unknown as running


def dir_stats(p):
    n, size = 0, 0
    if not p.exists() or is_junction(p):
        return n, size
    for f in p.rglob("*"):
        if f.is_file():
            try:
                size += f.stat().st_size
                n += 1
            except OSError:
                pass
    return n, size


def do_analyze():
    total = 0
    print("target:", DEST)
    for name in DIRS:
        src = HOME / name
        n, size = dir_stats(src)
        total += size
        state = "JUNCTION" if is_junction(src) else ("missing" if not src.exists() else "plain")
        print("  {:<24} {:>7} files {:>9.1f} MB  {}".format(name, n, size / 1024 ** 2, state))
    print("total to relocate: {:.1f} MB".format(total / 1024 ** 2))
    print("E: free = {:.2f} GB".format(shutil.disk_usage("E:\\").free / 1024 ** 3))
    print("C: free = {:.2f} GB".format(shutil.disk_usage("C:\\").free / 1024 ** 3))
    print("WorkBuddy running:", app_running())


def confirm(prompt):
    print(prompt)
    print('Type YES to continue (anything else aborts): ', end="", flush=True)
    return input().strip() == "YES"


def robocopy_copy(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["robocopy", str(src), str(dst), "/E", "/R:1", "/W:1",
           "/COPY:DAT", "/DCOPY:DAT", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"]
    r = subprocess.run(cmd, capture_output=True, text=True, errors="ignore")
    return r.returncode < 8, r.returncode


def make_junction(src, dst):
    r = subprocess.run(["cmd", "/c", "mklink", "/J", str(src), str(dst)],
                       capture_output=True, text=True, errors="ignore")
    return r.returncode == 0, (r.stdout or "") + (r.stderr or "")


def do_apply():
    if app_running():
        print("ERROR: WorkBuddy is still running. Quit it completely, then run this again.")
        print("       (Quit from the tray icon, not just close the window.)")
        return 2
    plan = []
    for name in DIRS:
        src = HOME / name
        if not src.exists() or is_junction(src):
            continue
        n, size = dir_stats(src)
        plan.append((name, n, size))
    total = sum(x[2] for x in plan)
    print("About to relocate {} folders / {:.1f} MB to {}".format(
        len(plan), total / 1024 ** 2, DEST))
    print("Old folders are kept as <name>__retired_<timestamp> (nothing deleted).")
    if not confirm("This changes where WorkBuddy stores its logs/history."):
        print("aborted")
        return 1

    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    done = []
    for name, n, size in plan:
        src = HOME / name
        dst = DEST / name
        ok, rc = robocopy_copy(src, dst)
        if not ok:
            print("FAIL robocopy", name, "rc=", rc)
            break
        dn, dsize = dir_stats(dst)
        if dn < n or dsize + 1 < size:
            print("FAIL verification", name, "src", n, size, "dst", dn, dsize)
            break
        retired = HOME / (name + "__retired_" + ts)
        try:
            src.rename(retired)
        except OSError as e:
            print("FAIL rename", name, e)
            break
        ok, msg = make_junction(src, dst)
        if not ok or not is_junction(src):
            print("FAIL junction", name, msg)
            try:
                retired.rename(src)
            except OSError:
                pass
            break
        done.append({"name": name, "src_files": n, "src_bytes": size,
                     "dst_files": dn, "dst_bytes": dsize,
                     "retired": str(retired), "junction": str(src), "target": str(dst)})
        print("OK  {:24} {:6} files {:8.1f} MB".format(name, n, size / 1024 ** 2))

    report = {
        "applied_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "timestamp": ts,
        "dest_root": str(DEST),
        "moved": done,
        "failed": len(done) != len(plan),
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("report ->", REPORT)
    print("moved {}/{} folders".format(len(done), len(plan)))
    if len(done) != len(plan):
        print("Partial run: use --rollback to restore, then retry after fixing the error.")
        return 3
    print("Now restart WorkBuddy. All future writes land on E:.")
    return 0


def do_verify():
    ok = True
    for name in DIRS:
        src, dst = HOME / name, DEST / name
        j = is_junction(src)
        d = dst.is_dir()
        if not (j and d):
            print("FAIL {:24} junction={} dest_exists={}".format(name, j, d))
            ok = False
    print("RESULT:", "PASS (all relocated)" if ok else "NOT FULLY RELOCATED")
    return 0 if ok else 1


def do_rollback():
    if not REPORT.exists():
        print("ERROR: no report")
        return 1
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    if app_running():
        print("ERROR: quit WorkBuddy first")
        return 2
    for item in reversed(rep["moved"]):
        src = pathlib.Path(item["junction"])
        retired = pathlib.Path(item["retired"])
        if is_junction(src):
            try:
                os.rmdir(src)  # removes only the junction, not its target
            except OSError as e:
                print("WARN cannot remove junction", src, e)
                continue
        if not src.exists() and retired.exists():
            retired.rename(src)
            print("restored", src)
    print("rollback done; E: copies kept at", DEST)
    return 0


def do_purge():
    """Optional: send the retired C: folders to the Recycle Bin to free space."""
    retired = sorted(p for p in HOME.glob("*__retired_*") if p.is_dir())
    if not retired:
        print("no retired folders found")
        return 0
    total = sum(dir_stats(p)[1] for p in retired)
    print("{} retired folders / {:.1f} MB will go to the Recycle Bin:".format(
        len(retired), total / 1024 ** 2))
    for p in retired:
        print("  ", p.name)
    if not confirm("Only do this after WorkBuddy has run normally for a while."):
        print("aborted")
        return 1
    ps = (
        "Add-Type -AssemblyName Microsoft.VisualBasic; "
        "$p=$args[0]; "
        "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory("
        "$p,'OnlyErrorDialogs','SendToRecycleBin')"
    )
    for p in retired:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps, str(p)],
            capture_output=True, text=True, errors="ignore",
        )
        print(("OK  " if r.returncode == 0 else "FAIL "), p.name,
              (r.stderr or "").strip()[:120])
    return 0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    for flag in ("--analyze", "--apply", "--verify", "--rollback", "--purge"):
        g.add_argument(flag, action="store_true")
    a = ap.parse_args()
    if a.analyze:
        do_analyze()
        return 0
    if a.apply:
        return do_apply()
    if a.verify:
        return do_verify()
    if a.rollback:
        return do_rollback()
    return do_purge()


if __name__ == "__main__":
    sys.exit(main())
