# -*- coding: utf-8 -*-
"""
合同到期提醒：读取 contract_reminders.json，按 90/60/30/15/7/3/1/0 天档位提醒。
每档只提醒一次（状态存 contract_reminder_state.json）；命中即发 QQ 邮件。
用法：
  python check_contract_expiry.py            # 正常执行（命中才发邮件）
  python check_contract_expiry.py --dry-run  # 只打印不发邮件、不写状态
  python check_contract_expiry.py --force    # 忽略档位，把所有在保合同都发一封（测试用）
"""
import json
import os
import sys
import subprocess
from datetime import date, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "contract_reminders.json")
STATE = os.path.join(BASE, "contract_reminder_state.json")
MAIL = os.path.join(BASE, "wb_checkin", "notify_mail.py")
PY = sys.executable


def load(path, default):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


def parse(d):
    return datetime.strptime(d, "%Y-%m-%d").date()


def main():
    dry = "--dry-run" in sys.argv
    force = "--force" in sys.argv

    cfg = load(DATA, {})
    contracts = cfg.get("contracts", [])
    thresholds = sorted(cfg.get("thresholds", [90, 60, 30, 15, 7, 3, 1, 0]), reverse=True)
    state = load(STATE, {})
    today = date.today()

    hits = []
    for c in contracts:
        try:
            end = parse(c["end"])
        except Exception:
            continue
        days = (end - today).days
        num = c.get("number", "")
        if force:
            hits.append((c, days, "测试"))
            continue
        for t in thresholds:
            if days <= t:
                key = "%s|%d" % (num, t)
                if key not in state:
                    label = "已到期" if days < 0 else "%d天" % days
                    hits.append((c, days, "T-%d档（实际%s）" % (t, label)))
                    if not dry:
                        state[key] = today.isoformat()
                    break
                # 该档已提醒过：继续向下匹配更低档位，避免卡死在高档位

    if not hits:
        print("[%s] 无到期提醒触发（%d份合同在监控中）" % (today.isoformat(), len(contracts)))
        for c in contracts:
            try:
                print("  %s %s 剩 %d 天" % (c["name"], c["number"], (parse(c["end"]) - today).days))
            except Exception:
                pass
        return

    lines = []
    rows = []
    hits.sort(key=lambda x: x[1])
    for c, days, why in hits:
        if days < 0:
            status = '<b style="color:#c00">已到期 %d 天</b>' % abs(days)
        elif days == 0:
            status = '<b style="color:#c00">今天到期</b>'
        elif days <= 7:
            status = '<b style="color:#c00">剩 %d 天</b>' % days
        elif days <= 30:
            status = '<b style="color:#d97706">剩 %d 天</b>' % days
        else:
            status = "剩 %d 天" % days
        rows.append(
            "<tr>"
            "<td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td>"
            "</tr>"
            % (
                c["name"],
                c.get("number", ""),
                c.get("end", ""),
                status,
                "¥{:,.2f}".format(float(c.get("amount", 0))),
                c.get("note", ""),
            )
        )

    title = "【合同到期提醒】%s 共%d份合同需关注" % (today.isoformat(), len(hits))
    body = """<html><body style="font-family:'Microsoft YaHei',Arial,sans-serif;font-size:14px;color:#222">
<h2 style="color:#c8102e;margin:0 0 6px">合同到期提醒 · %s</h2>
<p style="color:#666;margin:0 0 14px">本邮件由到期提醒脚本自动发出，每档只提醒一次（90/60/30/15/7/3/1/0天）</p>
<table cellspacing="0" cellpadding="6" border="1" style="border-collapse:collapse;border-color:#e5e7eb;font-size:13px">
<thead><tr style="background:#f7f7f8">
<th>合同</th><th>编号</th><th>到期日</th><th>状态</th><th>合同额</th><th>备注</th>
</tr></thead>
<tbody>%s</tbody></table>
<p style="margin-top:16px;color:#666;font-size:12px">提示：<br>
1. 按合同第五条，期满前 1 个月须启动下一期协商/续签；<br>
2. 到期前请确认是否续签、重新招标或并入其他合同；<br>
3. 如本提醒有误，修改 .workbuddy/scripts/contract_reminders.json 即可。</p>
</body></html>""" % (
        today.isoformat(),
        "".join(rows),
    )

    if dry:
        print("[DRY-RUN] 将发送：", title)
        for c, days, why in hits:
            print("  %s | %s | 剩 %d 天 | %s" % (c["name"], c["number"], days, why))
        return

    body_file = os.path.join(BASE, "contract_reminder_body.html")
    with open(body_file, "w", encoding="utf-8") as f:
        f.write(body)
    r = subprocess.run([PY, MAIL, title, body_file], capture_output=True, text=True)
    print("邮件脚本返回码:", r.returncode)
    print((r.stdout or "").strip())
    if r.returncode != 0:
        print("邮件发送失败:", (r.stderr or "")[-400:])
        sys.exit(1)

    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)
    print("已发送并记录状态：", ", ".join("%s(%s)" % (c["number"], why) for c, d, why in hits))


if __name__ == "__main__":
    main()
