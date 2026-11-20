# -*- coding: utf-8 -*-
"""Backup WorkBuddy account-critical data before switching to international version."""
import os, sys, json, zipfile, time

HOME = os.path.expanduser("~")
WB = os.path.join(HOME, ".workbuddy")
WS = os.path.join(HOME, "WorkBuddy", "Claw")

OUT_DIR = os.path.join(WS, "backups")
os.makedirs(OUT_DIR, exist_ok=True)
stamp = time.strftime("%Y%m%d_%H%M")
ZIP = os.path.join(OUT_DIR, "workbuddy_backup_%s.zip" % stamp)

ITEMS = [
    (os.path.join(WB, "memory"), "user_memory"),
    (os.path.join(WB, "skills"), "skills"),
    (os.path.join(WB, "tasks"), "tasks"),
    (os.path.join(WB, "automation-backups"), "automation_backups"),
    (os.path.join(WB, "sessions"), "sessions"),
    (os.path.join(WS, ".workbuddy", "memory"), "workspace_memory"),
]
FILES = [
    (os.path.join(WB, "USER.md"), "USER.md"),
    (os.path.join(WB, "IDENTITY.md"), "IDENTITY.md"),
    (os.path.join(WB, "SOUL.md"), "SOUL.md"),
    (os.path.join(WB, "settings.json"), "settings.json"),
    (os.path.join(WB, "models.json"), "models.json"),
    (os.path.join(WB, "mcp.json"), "mcp.json"),
    (os.path.join(WS, ".workbuddy", "memory", "MEMORY.md"), "workspace_MEMORY.md"),
]

n = 0
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for src, arc in ITEMS:
        if not os.path.isdir(src):
            continue
        for root, dirs, fs in os.walk(src):
            for f in fs:
                p = os.path.join(root, f)
                rel = os.path.relpath(p, src)
                z.write(p, os.path.join(arc, rel))
                n += 1
    for src, arc in FILES:
        if os.path.isfile(src):
            z.write(src, arc)
            n += 1

print("ZIP:", ZIP)
print("files:", n, "size MB: %.2f" % (os.path.getsize(ZIP) / 1048576.0))

# also dump an inventory
inv = {
    "created": time.strftime("%Y-%m-%d %H:%M:%S"),
    "home": HOME,
    "workspace": WS,
    "items": [a for _, a in ITEMS],
    "automations_note": "run automation_update list to re-create; definitions live in ~/.workbuddy/tasks + automation-backups",
}
ip = os.path.join(OUT_DIR, "backup_manifest_%s.json" % stamp)
json.dump(inv, open(ip, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("manifest:", ip)
