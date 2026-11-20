#!/usr/bin/env python3
"""Switch the WorkBuddy workspace binding from C: to E: (idempotent, reversible).

Usage:
  python switch_workspace_to_e.py --analyze   # read-only plan
  python switch_workspace_to_e.py --apply     # backup + switch + verify
  python switch_workspace_to_e.py --verify    # read-only verification
  python switch_workspace_to_e.py --revert    # restore db bindings only

The running app caches its session state, so a restart is required for the
change to take effect. The script is idempotent: re-running after restart is safe.
"""
import argparse
import datetime
import json
import os
import pathlib
import shutil
import sqlite3
import sys
import time

HOME = pathlib.Path(r"C:\Users\chenjialin3\.workbuddy")
DB = HOME / "workbuddy.db"
OLD = r"C:\Users\chenjialin3\WorkBuddy\Claw"
NEW = r"E:\workbuddy\Claw"
SESSION_ID = "360457fb-180f-4af1-a212-c3b59e5dcb57"
OLD_SLUG = "c-Users-chenjialin3-WorkBuddy-Claw"
NEW_SLUG = "e-workbuddy-Claw"
BACKUP_DIR = pathlib.Path(r"E:\workbuddy\Claw\.workbuddy\backups")
REPORT = pathlib.Path(r"E:\workbuddy\Claw\.workbuddy\workspace_switch_report.json")


def connect(readonly=False):
    if readonly:
        con = sqlite3.connect("file:" + DB.as_posix() + "?mode=ro", uri=True)
    else:
        con = sqlite3.connect(DB, timeout=20)
        con.execute("PRAGMA busy_timeout=20000")
    con.row_factory = sqlite3.Row
    return con


def read_state(con):
    row = con.execute(
        "SELECT id, cwd, status, updated_at FROM sessions WHERE id=?", (SESSION_ID,)
    ).fetchone()
    workspaces = [
        dict(r) for r in con.execute("SELECT path, last_opened_at FROM workspaces")
    ]
    return {"session": dict(row) if row else None, "workspaces": workspaces}


def backup_db():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / ("workbuddy_db_before_switch_" + ts + ".db")
    src = connect(readonly=True)
    out = sqlite3.connect(dst)
    try:
        src.backup(out)
    finally:
        out.close()
        src.close()
    return dst


def history_files():
    src = HOME / "projects" / OLD_SLUG
    dst = HOME / "projects" / NEW_SLUG
    return src, dst, sorted(f for f in src.glob(SESSION_ID + "*") if f.is_file())


def link_history():
    """Keep the long-running conversation readable from the new cwd slug.

    Hard links cost no extra disk space and stay in sync with the original.
    Falls back to a real copy when NTFS hard links are not permitted.
    """
    src_dir, dst_dir, files = history_files()
    if not src_dir.exists():
        return {"error": "source project dir missing: " + str(src_dir), "items": []}
    dst_dir.mkdir(parents=True, exist_ok=True)
    items = []
    for f in files:
        d = dst_dir / f.name
        if d.exists():
            items.append({"name": f.name, "action": "already_exists", "bytes": d.stat().st_size})
            continue
        method = "hardlink"
        try:
            os.link(f, d)
        except OSError:
            shutil.copy2(f, d)
            method = "copy"
        items.append({"name": f.name, "action": method, "bytes": d.stat().st_size})
    return {"src": str(src_dir), "dst": str(dst_dir), "items": items}


def do_analyze():
    con = connect(readonly=True)
    st = read_state(con)
    con.close()
    src_dir, dst_dir, files = history_files()
    print("current session :", st["session"])
    print("old workspace   :", [w for w in st["workspaces"] if w["path"].lower() == OLD.lower()])
    print("new workspace   :", [w for w in st["workspaces"] if w["path"].lower() == NEW.lower()])
    print("history src     :", src_dir, "exists=", src_dir.exists(), "files=", len(files))
    print("history dst     :", dst_dir, "exists=", dst_dir.exists())
    for f in files:
        print("   ", f.name, f.stat().st_size)
    print("plan: session cwd OLD->NEW; workspaces row OLD->NEW (recent); "
          "history mirrored via NTFS hard link; full db backup to E:")


def do_apply():
    before_con = connect(readonly=True)
    before = read_state(before_con)
    before_con.close()
    if before["session"] is None:
        print("ERROR: current session not found, abort")
        return 1
    if not pathlib.Path(NEW).is_dir():
        print("ERROR: target workspace does not exist:", NEW)
        return 1

    backup = backup_db()
    print("db backup ->", backup, backup.stat().st_size, "bytes")

    now_ms = int(time.time() * 1000)
    old_row = next(
        (w for w in before["workspaces"] if w["path"].lower() == OLD.lower()), None
    )
    new_row = next(
        (w for w in before["workspaces"] if w["path"].lower() == NEW.lower()), None
    )

    con = connect()
    try:
        con.execute("BEGIN IMMEDIATE")
        cur = con.execute(
            "UPDATE sessions SET cwd=? WHERE id=? AND cwd=?",
            (NEW, SESSION_ID, OLD),
        )
        session_changed = cur.rowcount
        if old_row:
            con.execute("DELETE FROM workspaces WHERE path=?", (OLD,))
        if new_row:
            con.execute(
                "UPDATE workspaces SET last_opened_at=? WHERE path=?", (now_ms, NEW)
            )
        else:
            con.execute(
                "INSERT INTO workspaces(path, last_opened_at) VALUES (?, ?)",
                (NEW, now_ms),
            )
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
    print("session rows updated:", session_changed)
    print("workspaces: OLD row removed, NEW row last_opened_at =", now_ms)

    hist = link_history()
    print("history mirror ->", hist.get("dst"))
    for it in hist.get("items", []):
        print("   ", it["name"], it["action"], it["bytes"])

    report = {
        "applied_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "old_cwd": OLD,
        "new_cwd": NEW,
        "session_id": SESSION_ID,
        "db_backup": str(backup),
        "before": before,
        "history": hist,
        "note": "Restart WorkBuddy for the running session to pick up the new cwd.",
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("report ->", REPORT)
    return do_verify()


def do_verify():
    con = connect(readonly=True)
    st = read_state(con)
    con.close()
    ok = True
    sess = st["session"]
    if not sess or sess["cwd"].lower() != NEW.lower():
        print("FAIL session cwd =", sess["cwd"] if sess else None)
        ok = False
    else:
        print("OK   session cwd =", sess["cwd"])
    ws_old = [w for w in st["workspaces"] if w["path"].lower() == OLD.lower()]
    ws_new = [w for w in st["workspaces"] if w["path"].lower() == NEW.lower()]
    if ws_old:
        print("FAIL old workspace row still present:", ws_old)
        ok = False
    else:
        print("OK   old workspace row removed")
    if not ws_new:
        print("FAIL new workspace row missing")
        ok = False
    else:
        newest = max(st["workspaces"], key=lambda w: w["last_opened_at"])
        print("OK   new workspace registered, last_opened_at =", ws_new[0]["last_opened_at"])
        print("     most recently opened workspace =", newest["path"])
        if newest["path"].lower() != NEW.lower():
            print("WARN new workspace is not the most recent one")

    src_dir, dst_dir, files = history_files()
    for f in files:
        d = dst_dir / f.name
        if not d.exists() or d.stat().st_size != f.stat().st_size:
            print("FAIL history mirror:", f.name)
            ok = False
    if files:
        print("OK   history mirror files:", len(files), "all present and same size")
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 2


def do_revert():
    """Restore db bindings only; history mirror files are left in place (harmless)."""
    if not REPORT.exists():
        print("ERROR: no report to revert from")
        return 1
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    before = rep["before"]
    old_row = next(
        (w for w in before["workspaces"] if w["path"].lower() == OLD.lower()), None
    )
    new_row = next(
        (w for w in before["workspaces"] if w["path"].lower() == NEW.lower()), None
    )
    con = connect()
    try:
        con.execute("BEGIN IMMEDIATE")
        con.execute(
            "UPDATE sessions SET cwd=? WHERE id=?", (OLD, SESSION_ID)
        )
        con.execute("DELETE FROM workspaces WHERE path=?", (NEW,))
        if new_row:
            con.execute(
                "INSERT OR REPLACE INTO workspaces(path,last_opened_at) VALUES(?,?)",
                (NEW, new_row["last_opened_at"]),
            )
        if old_row:
            con.execute(
                "INSERT OR REPLACE INTO workspaces(path,last_opened_at) VALUES(?,?)",
                (OLD, old_row["last_opened_at"]),
            )
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
    print("reverted session cwd to", OLD)
    return 0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--analyze", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true")
    g.add_argument("--revert", action="store_true")
    a = ap.parse_args()
    if a.analyze:
        do_analyze()
        return 0
    if a.apply:
        return do_apply()
    if a.verify:
        return do_verify()
    return do_revert()


if __name__ == "__main__":
    sys.exit(main())
