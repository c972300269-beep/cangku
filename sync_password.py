#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一处改密，全盘同步 chenjialin3 登录密码。

用法（推荐用环境变量传参，避免 shell 吃掉 ! 等特殊字符）:
    WB_NEW_PASS='<新密码>' python sync_password.py
    WB_NEW_PASS='<新密码>' python sync_password.py --dry-run
    python sync_password.py '<新密码>' --dry-run

原理：以 E 盘 run_daily_brief.cmd 里的 BPM_PASS 为「当前密码」锚点，
按字节替换 E 盘 .workbuddy/scripts 下所有该字面量（含 .bak_* 备份），
不改换行、不碰 memory/reports、不改任何其它内容。幂等：目标值相同则 0 变更。
"""
from __future__ import annotations

import os
import pathlib
import subprocess
import sys

# 2026-11-05 起 C 盘工作区已清空业务文件，凭据只在 E 盘维护
ROOTS = [
    pathlib.Path(r"E:\workbuddy\Claw\.workbuddy"),
]
ANCHORS = [
    ROOTS[0] / "scripts" / "run_daily_brief.cmd",
]
NODE = pathlib.Path(
    r"C:\Users\chenjialin3\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
)
ANCHOR_RE = rb'set\s+"BPM_PASS=([^"\r\n]*)"'
SKIP_DIRS = {
    "memory", "node_modules", "__pycache__", "reports", "downloads",
    "backups", "samples", "models", "snapshots", "events", ".git",
}
BINARY_SUFFIX = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".onnx", ".avi", ".mp4", ".xlsx", ".docx"}
MIN_FILES_EXPECTED = 6
MAX_SIZE = 1_500_000
# 这些字符在不同语言/批处理里转义规则不同，遇到就拒绝写入，交人工按上下文处理
DANGEROUS = set('"\'\\%&|^<>()\r\n\t')


def mask(s: str) -> str:
    if len(s) <= 2:
        return "*" * len(s)
    return s[:2] + "*" * (len(s) - 3) + s[-1]


def fail(msg: str) -> None:
    print("❌ " + msg)
    sys.exit(1)


def current_password() -> str:
    import re
    for p in ANCHORS:
        if p.is_file():
            m = re.search(ANCHOR_RE, p.read_bytes())
            if m:
                return m.group(1).decode("ascii")
    fail("找不到锚点 BPM_PASS（检查 E/C 盘 run_daily_brief.cmd）")
    return ""


def scan_files():
    """只扫代码/启动器目录，排除记忆与报告。"""
    seen = set()
    for root in ROOTS:
        sdir = root / "scripts"
        if sdir.is_dir():
            for p in sdir.rglob("*"):
                if not p.is_file() or p.suffix.lower() in BINARY_SUFFIX:
                    continue
                parts = p.relative_to(sdir).parts[:-1]
                if any(x in SKIP_DIRS for x in parts):
                    continue
                if p.stat().st_size > MAX_SIZE:
                    continue
                key = str(p).lower()
                if key not in seen:
                    seen.add(key)
                    yield p
        for p in root.glob("*"):
            if (p.is_file() and p.suffix.lower() in {".cmd", ".bat", ".py", ".js"}
                    and p.stat().st_size <= MAX_SIZE):
                key = str(p).lower()
                if key not in seen:
                    seen.add(key)
                    yield p


def is_cmd(p: pathlib.Path) -> bool:
    return p.suffix.lower() in {".cmd", ".bat"} or p.name.startswith("run_daily_brief.cmd")


def check_cmd(data: bytes) -> None:
    if b"\r\n" not in data:
        raise ValueError("换行不是 CRLF")
    if any(b >= 128 for b in data):
        raise ValueError("含非 ASCII 字节")
    if b"\n" in data.replace(b"\r\n", b""):
        raise ValueError("存在裸 LF")


def residual_scan(old: bytes) -> list[str]:
    """同步后全盘找残留（含记忆层），只读、不修改。"""
    hits = []
    for root in ROOTS:
        for p in root.rglob("*"):
            if not p.is_file() or p.suffix.lower() in BINARY_SUFFIX:
                continue
            parts = p.relative_to(root).parts[:-1]
            if any(x in {"node_modules", "__pycache__", "reports", "downloads", "backups", "samples", "models", "snapshots", "events", ".git"} for x in parts):
                continue
            try:
                if p.stat().st_size > MAX_SIZE:
                    continue
                data = p.read_bytes()
            except OSError:
                continue
            if b"\x00" in data or old not in data:
                continue
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if old.decode("utf-8") in line:
                    hits.append(f"{p}:{i}")
    return hits


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry = "--dry-run" in sys.argv
    new = os.environ.get("WB_NEW_PASS") or (args[0] if args else "")
    if not new:
        fail("缺少新密码：用 WB_NEW_PASS 环境变量或第一个参数传入")

    bad = sorted(set(new) & DANGEROUS)
    if bad:
        fail("新密码含需按上下文转义的字符 " + repr(bad) +
             "；为避免写坏配置已中止，请人工处理（cmd 用 %%，JS/Python 需转义引号）")
    if not new.isascii():
        fail("新密码含非 ASCII 字符；cmd 启动器要求纯 ASCII，已中止，请人工处理")

    old = current_password()
    if len(old) < 6:
        fail("锚点密码长度异常（%d），拒绝批量替换" % len(old))
    print("当前密码(锚点): %s  ← %s" % (mask(old), str(ANCHORS[0])))
    print("目标密码      : %s" % mask(new))
    print("模式          : %s" % ("预览 --dry-run（不写文件）" if dry else "实际写入"))

    if old == new:
        print("\n✅ 目标值与当前值相同，无需变更（幂等，0 个文件被改写）")
        return

    old_b, new_b = old.encode("utf-8"), new.encode("utf-8")
    targets = []
    for p in scan_files():
        try:
            data = p.read_bytes()
        except OSError:
            continue
        if b"\x00" in data or old_b not in data:
            continue
        targets.append((p, data, data.count(old_b)))

    total = sum(n for _, _, n in targets)
    print("\n命中 %d 个文件 / 共 %d 处：" % (len(targets), total))
    for p, _, n in targets:
        print("  %-88s %d 处" % (str(p), n))
    if len(targets) < MIN_FILES_EXPECTED:
        print("⚠️ 命中文件数 %d < 预期 %d，可能有遗漏，请人工核对" % (len(targets), MIN_FILES_EXPECTED))

    # 写前统一校验，任一项失败则整体不动
    plans = []
    for p, data, n in targets:
        data2 = data.replace(old_b, new_b)
        try:
            if is_cmd(p):
                check_cmd(data2)
            if p.suffix.lower() == ".py":
                compile(data2.decode("utf-8"), str(p), "exec")
        except Exception as e:
            fail("写前校验失败 %s: %s（所有文件均未改动）" % (p, e))
        plans.append((p, data, data2, n))

    if dry:
        print("\n预览完成，未写入任何文件。")
        return

    written = []
    try:
        for p, data, data2, _ in plans:
            p.write_bytes(data2)
            written.append((p, data))
    except OSError as e:
        for p, data in written:
            p.write_bytes(data)
        fail("写入失败并已回滚: %s" % e)

    # 写后语法校验（JS 用 node --check）
    js_ok = py_ok = cmd_ok = 0
    for p, _, data2, _ in plans:
        if p.suffix.lower() == ".js":
            if NODE.is_file():
                r = subprocess.run([str(NODE), "--check", str(p)],
                                   capture_output=True, text=True)
                if r.returncode != 0:
                    for q, data in written:
                        q.write_bytes(data)
                    fail("JS 语法校验失败并已回滚 %s: %s" % (p, r.stderr.strip()[:300]))
            js_ok += 1
        elif p.suffix.lower() == ".py":
            py_ok += 1
        elif is_cmd(p):
            cmd_ok += 1

    print("\n校验: cmd CRLF+纯ASCII %d 个 OK | JS node --check %d 个 OK | Python compile %d 个 OK"
          % (cmd_ok, js_ok, py_ok))

    left = residual_scan(old_b)
    print("残留检查: %s" % ("✅ 全盘无旧值" if not left else "⚠️ 仍有 %d 处: %s" % (len(left), ", ".join(left[:10]))))
    print("\n✅ 同步完成：%d 个文件 / %d 处。下一步必须实跑一次 BPM 登录验证。" % (len(plans), total))


if __name__ == "__main__":
    main()
