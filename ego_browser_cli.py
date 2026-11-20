"""ego-browser CLI wrapper.

Routes browser automation to the ego lite installation on E:.
Works even when onboarding has not registered `ego-browser` on PATH.

Usage:
    py -3.12 ego_browser_cli.py skill
    py -3.12 ego_browser_cli.py nodejs -e "console.log('ready')"
    py -3.12 ego_browser_cli.py --version
"""
import os
import subprocess
import sys

PRIMARY = r"E:\workbuddy\Claw\_appdata\Citro Labs\ego lite\Application\0.6.2.7\ego-browser.exe"
FALLBACK = r"C:\Users\chenjialin3\.local\share\ego\active_version_dir\ego-browser.exe"


def resolve():
    for p in (PRIMARY, FALLBACK):
        if os.path.isfile(p):
            return p
    return None


def main():
    exe = resolve()
    if not exe:
        print("ERROR: ego-browser.exe not found (ego lite not installed?)", file=sys.stderr)
        return 2
    return subprocess.call([exe] + sys.argv[1:])


if __name__ == "__main__":
    sys.exit(main())
