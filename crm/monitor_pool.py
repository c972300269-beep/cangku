#!/usr/bin/env python3
"""
CRM 共享池工单自动监控 & 认领脚本
- 每8分钟检查「共享池」中的工单
- 工单创建超过8分钟无人认领 → 自动获取处理权（转发给陈家林）
- 输出结果供 WorkBuddy 自动化读取并通知用户
"""

import asyncio
import json
import shutil
import subprocess
import tempfile
import sys
import signal
from pathlib import Path
from datetime import datetime, timezone

from playwright.async_api import async_playwright


def cleanup_orphan_chromium():
    """终止上次运行残留的 chrome/chromium 进程，释放内存"""
    try:
        killed = 0
        result = subprocess.run(
            ["taskkill", "/F", "/IM", "chrome.exe", "/FI", "WINDOWTITLE eq about:blank"],
            capture_output=True, timeout=10,
        )
        killed += 1 if result.returncode == 0 else 0
    except Exception:
        pass
    # 清理 Playwright 残留的 chromium 进程
    try:
        result = subprocess.run(
            ["wmic", "process", "where", "name='chrome-headless-shell.exe'", "delete"],
            capture_output=True, timeout=10,
        )
    except Exception:
        pass
    # 清理超过10分钟的旧临时目录
    try:
        import os
        tmpdir = Path(tempfile.gettempdir())
        cutoff = datetime.now().timestamp() - 600
        for d in tmpdir.glob("chrome_profile_*"):
            try:
                if d.stat().st_mtime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
    except Exception:
        pass

# === 配置 ===
CRM_URL = "https://times-crm.timesgroup.cn:28092/html/App.html#/app/shared-pool"
CHROME_USER_DATA = Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"
WORK_DIR = Path(__file__).resolve().parent.parent.parent.parent  # Claw workspace root
STATE_FILE = WORK_DIR / ".workbuddy" / "scripts" / "crm" / "pool_state.json"
NOTIFY_FILE = WORK_DIR / ".workbuddy" / "scripts" / "crm" / "notify.json"
ALERT_FILE = WORK_DIR / ".workbuddy" / "scripts" / "crm" / "alert.txt"  # 触发提醒的标记文件
TIMEOUT_MINUTES = 8
RETRY_COUNT = 2         # 认领失败后重试次数（总共最多3次尝试）
RETRY_DELAY_SEC = 60    # 重试间隔秒数
TARGET_HANDLER = "陈家林"


def send_email(claimed_orders):
    """通过QQ邮箱SMTP发送工单认领通知邮件"""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    if not claimed_orders:
        return

    try:
        smtp_server = "smtp.qq.com"
        smtp_port = 465
        sender = "972300269@qq.com"
        password = "__REDACTED_SECRET__"
        receiver = "972300269@qq.com"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "CRM共享池工单已自动转派"
        msg["From"] = sender
        msg["To"] = receiver

        # 构建HTML表格
        rows_html = ""
        for o in claimed_orders:
            rows_html += f"""
            <tr>
                <td style="border:1px solid #ddd;padding:6px 10px;">{o.get('orderNo','')}</td>
                <td style="border:1px solid #ddd;padding:6px 10px;">{o.get('title','')}</td>
                <td style="border:1px solid #ddd;padding:6px 10px;">{o.get('category','')}</td>
                <td style="border:1px solid #ddd;padding:6px 10px;">{o.get('ageMinutes','')}分钟</td>
            </tr>"""

        html = f"""
        <html><body>
        <p>以下工单已从共享池自动转派：</p>
        <table style="border-collapse:collapse;width:100%;">
            <tr style="background:#f5f5f5;">
                <th style="border:1px solid #ddd;padding:8px 10px;text-align:left;">单号</th>
                <th style="border:1px solid #ddd;padding:8px 10px;text-align:left;">标题</th>
                <th style="border:1px solid #ddd;padding:8px 10px;text-align:left;">类别</th>
                <th style="border:1px solid #ddd;padding:8px 10px;text-align:left;">等待时长</th>
            </tr>
            {rows_html}
        </table>
        <p style="color:#999;margin-top:16px;">— WorkBuddy自动监控</p>
        </body></html>"""

        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=15) as server:
            server.login(sender, password)
            server.sendmail(sender, receiver, msg.as_string())

        log(f"📧 邮件已发送至 {receiver}")
    except Exception as e:
        log(f"❌ 邮件发送失败: {e}")


def send_windows_notify(title, body):
    """弹出Windows系统通知（持久化，留在通知中心直到手动关闭）"""
    try:
        import subprocess
        # 用PowerShell直接调API，设置为Reminder场景确保通知持久化
        ps_script = f'''
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$textNodes = $xml.GetElementsByTagName("text")
$textNodes.Item(0).AppendChild($xml.CreateTextNode("{title}")) > $null
$textNodes.Item(1).AppendChild($xml.CreateTextNode("{body}")) > $null

# 设为Reminder场景：通知不会自动消失，留在操作中心直到手动清除
$toastNode = $xml.SelectSingleNode("//toast")
$toastNode.SetAttribute("scenario", "reminder")
$toastNode.SetAttribute("duration", "long")

$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.ExpirationTime = [DateTimeOffset]::Now.AddDays(1)
$toast.Tag = "crm-claim"
$toast.Group = "CRM共享池"

$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("WorkBuddy CRM Monitor")
$notifier.Show($toast)
'''
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True, timeout=10,
        )
    except Exception:
        pass  # 通知失败不影响主流程


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"processed": [], "last_check": None}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def save_notify(claimed_orders):
    """保存通知数据，供WorkBuddy自动化读取。空列表时不覆盖已有数据。"""
    if not claimed_orders:
        return  # 不覆盖已有的通知数据，避免自动化错过通知
    NOTIFY_FILE.parent.mkdir(parents=True, exist_ok=True)
    NOTIFY_FILE.write_text(json.dumps({
        "time": datetime.now().isoformat(),
        "claimed": claimed_orders,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_time(time_str):
    time_str = time_str.strip().replace("\n", " ").replace("\r", " ")
    if not time_str:
        return None
    try:
        return datetime.strptime(time_str.strip(), "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            return datetime.strptime(time_str.strip(), "%Y-%m-%d")
        except ValueError:
            return None


async def extract_orders(page):
    """从共享池表格提取工单数据"""
    return await page.evaluate("""() => {
        const rows = document.querySelectorAll('table tbody tr');
        return Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 7) {
                return {
                    orderNo: cells[0].textContent.trim(),
                    category: cells[1].textContent.trim(),
                    title: cells[2].textContent.trim(),
                    nodeName: cells[3].textContent.trim(),
                    creator: cells[4].textContent.trim(),
                    startTime: cells[5].textContent.trim().replace(/\\s+/g, ' '),
                    actionText: cells[6].textContent.trim(),
                };
            }
            return null;
        }).filter(o => o !== null && o.orderNo);
    }""")


async def claim_order(page, order):
    """点击「获取处理权」认领工单，尝试多种方式"""
    order_no = order.get("orderNo", "")
    log(f"  尝试认领工单 {order_no}...")

    try:
        row = page.locator(f"tr:has-text('{order_no}')").first
        if await row.count() == 0:
            log(f"  ⚠ 未找到工单行 {order_no}")
            return False

        dialog_handled = False

        async def handle_dialog(dialog):
            nonlocal dialog_handled
            dialog_handled = True
            log(f"  弹窗确认: {dialog.message}")
            await dialog.accept()

        page.on("dialog", handle_dialog)

        # 策略1: Playwright 精确点击"获取处理权"按钮
        claim_btn = row.locator("button:has-text('获取处理权')").first
        if await claim_btn.count() > 0:
            await claim_btn.click()
            log(f"  ✓ 已点击获取处理权按钮")
        else:
            # 策略2: JS兜底
            await page.evaluate(f"""(orderNo) => {{
                const rows = document.querySelectorAll('table tbody tr');
                for (let row of rows) {{
                    if (row.textContent.includes(orderNo)) {{
                        const btn = row.querySelector('button');
                        if (btn) {{ btn.click(); }}
                    }}
                }}
            }}""", order_no)
            log(f"  已JS点击按钮")

        await page.wait_for_timeout(4000)
        page.remove_listener("dialog", handle_dialog)

        if dialog_handled:
            log(f"  ✓ 已确认弹窗")

        # 刷新页面验证
        await page.reload(wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)
        body = await page.inner_text("body")
        if order_no not in body:
            log(f"  ✅ 工单 {order_no} 认领成功（已从共享池移除）")
            return True
        else:
            log(f"  ⚠ 工单仍在共享池中，认领未生效")
            return False

    except Exception as e:
        log(f"  ❌ 认领失败: {e}")
        return False


async def main():
    log("=" * 50)
    log("CRM 共享池工单监控开始")

    # 清理上次运行残留的chromium进程，释放内存
    cleanup_orphan_chromium()

    state = load_state()
    now = datetime.now()

    # 复制 Chrome profile 到临时目录（避免锁冲突）
    # 优化：只复制必要的认证文件（Cookies/Login Data），大幅减少复制体积
    temp_dir = Path(tempfile.mkdtemp(prefix="chrome_profile_"))
    skip_patterns = [
        "Cache", "Code Cache", "GPUCache", "ShaderCache",
        "Service Worker", "IndexedDB", "blob_storage",
        "File System", "shared_proto_db", "WebStorage",
        "Extensions", "Crashpad", "History", "Favicons",
        "Top Sites", "Media History", "Network Action Predictor",
        "Reporting and NEL", "Thumbnails", "Sessions",
        "Tabs", "Web Data",
    ]
    for item in ["Default", "Local State"]:
        src = CHROME_USER_DATA / item
        dst = temp_dir / item
        if src.exists():
            try:
                if src.is_dir():
                    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
                        *skip_patterns,
                    ), dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
            except Exception:
                pass

    claimed_orders = []

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(temp_dir),
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-sandbox",
                "--disable-gpu",
                "--window-size=1024,768",
                # 内存优化参数
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--disable-component-extensions-with-background-pages",
                "--disable-background-networking",
                "--disable-sync",
                "--disable-default-apps",
                "--disable-translate",
                "--disable-features=TranslateUI",
                "--disable-ipc-flooding-protection",
                "--disable-hang-monitor",
                "--disable-prompt-on-repost",
                "--disable-breakpad",
                "--metrics-recording-only",
                "--no-pings",
                "--mute-audio",
                # JS堆内存上限调高（原128MB太小，SPA页面易OOM崩溃）
                "--js-flags=--max-old-space-size=1024",
            ],
            ignore_https_errors=True,
            viewport={"width": 1024, "height": 768},
        )
        page = context.pages[0] if context.pages else await context.new_page()
        # 全局页面超时：90秒，防止浏览器挂死
        page.set_default_timeout(90000)

        try:
            log(f"打开共享池: {CRM_URL}")
            # 使用 domcontentloaded 替代 networkidle（SPA页面后台持续请求，networkidle会永久超时）
            try:
                await page.goto(CRM_URL, wait_until="domcontentloaded", timeout=30000)
            except Exception:
                # domcontentloaded 也超时的话，尝试 load 策略
                log("domcontentloaded超时，尝试load策略...")
                await page.goto(CRM_URL, wait_until="load", timeout=30000)

            # 等待表格数据加载（SPA渲染需要时间）
            try:
                await page.wait_for_selector("table tbody tr", timeout=15000)
            except Exception:
                pass  # 可能没有工单，继续
            await page.wait_for_timeout(3000)

            if "login" in page.url.lower():
                log("❌ Session过期，需要重新登录CRM系统")
                save_notify([{"error": "session_expired"}])
                ALERT_FILE.parent.mkdir(parents=True, exist_ok=True)
                ALERT_FILE.write_text("1")
                return

            log("✓ 已登录共享池")

            orders = await extract_orders(page)
            log(f"共享池中 {len(orders)} 条工单")

            for order in orders:
                order_no = order.get("orderNo", "?")
                start_time = parse_time(order.get("startTime", ""))

                log(f"  工单 {order_no}: 发起={order.get('startTime')}, "
                    f"类别={order.get('category')}, 节点={order.get('nodeName')}")

                if start_time is None:
                    log(f"  ⚠ 无法解析发起时间，跳过")
                    continue

                age_min = (now - start_time).total_seconds() / 60
                log(f"    已等待 {age_min:.1f}分钟")

                if age_min < TIMEOUT_MINUTES:
                    log(f"    未到{TIMEOUT_MINUTES}分钟阈值，跳过")
                    continue

                # 1小时内处理过则跳过
                recently = any(
                    p.get("orderNo") == order_no
                    for p in state.get("processed", [])
                    if (now - datetime.fromisoformat(p["time"])).total_seconds() < 3600
                )
                if recently:
                    log(f"    1小时内已处理过，跳过")
                    continue

                log(f"    ⚡ 超过{TIMEOUT_MINUTES}分钟未认领，获取处理权...")
                success = await claim_order(page, order)

                # 失败重试：间隔 RETRY_DELAY_SEC 秒，最多重试 RETRY_COUNT 次
                retry_attempt = 0
                while not success and retry_attempt < RETRY_COUNT:
                    retry_attempt += 1
                    log(f"    🔄 认领失败，{RETRY_DELAY_SEC}秒后进行第{retry_attempt}次重试（共{RETRY_COUNT}次）...")
                    await page.wait_for_timeout(RETRY_DELAY_SEC * 1000)
                    # 刷新页面确保状态干净
                    try:
                        await page.reload(wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(3000)
                    except Exception:
                        log(f"    页面刷新失败，尝试继续...")
                    # 检查工单是否仍在共享池
                    try:
                        body_text = await page.inner_text("body")
                        if order_no not in body_text:
                            log(f"    ✅ 工单 {order_no} 已不在共享池（重试前已移除），视为认领成功")
                            success = True
                            break
                    except Exception:
                        pass
                    success = await claim_order(page, order)

                state["processed"].append({
                    "orderNo": order_no,
                    "time": now.isoformat(),
                    "success": success,
                    "startTime": order.get("startTime"),
                    "title": order.get("title"),
                    "category": order.get("category"),
                    "retries": retry_attempt,
                })

                if success:
                    claimed_orders.append({
                        "orderNo": order_no,
                        "title": order.get("title"),
                        "category": order.get("category"),
                        "startTime": order.get("startTime"),
                        "ageMinutes": round(age_min, 1),
                    })

            if claimed_orders:
                log(f"✅ 认领了 {len(claimed_orders)} 条工单:")
                for co in claimed_orders:
                    log(f"   - {co['orderNo']}: {co['title']} (等待{co['ageMinutes']}分钟)")
                save_notify(claimed_orders)
                # 直接通过QQ邮箱SMTP发送通知邮件，无需WorkBuddy自动化
                send_email(claimed_orders)
                # 写提醒标记文件，供WorkBuddy主对话检测（保留兼容）
                ALERT_FILE.parent.mkdir(parents=True, exist_ok=True)
                count = len(claimed_orders)
                try:
                    existing = int(ALERT_FILE.read_text().strip()) if ALERT_FILE.exists() else 0
                except Exception:
                    existing = 0
                ALERT_FILE.write_text(str(existing + count))
                # 邮件已由send_email直接发送
            elif len(orders) == 0:
                log("📭 共享池无工单")
                save_notify([])
            else:
                log("⏳ 无需认领（均在阈值内）")
                save_notify([])

            state["last_check"] = now.isoformat()
            save_state(state)

        except Exception as e:
            log(f"❌ 脚本错误: {e}")
            import traceback
            log(traceback.format_exc())
            save_notify([{"error": str(e)}])
            # 出错时也设置alert，让自动化有机会通知
            ALERT_FILE.parent.mkdir(parents=True, exist_ok=True)
            try:
                existing = int(ALERT_FILE.read_text().strip()) if ALERT_FILE.exists() else 0
            except Exception:
                existing = 0
            ALERT_FILE.write_text(str(existing + 1))
        finally:
            # 强制关闭所有页面以释放内存
            try:
                for p in context.pages:
                    await p.close()
            except Exception:
                pass
            try:
                await context.close()
            except Exception:
                pass

    # 清理临时目录
    shutil.rmtree(temp_dir, ignore_errors=True)
    # 再次清理残留chromium进程（context.close可能无法完全杀干净）
    cleanup_orphan_chromium()
    log("监控结束\n")

    # 打印结果摘要（供外层读取）
    print(f"\n===RESULT==={json.dumps({
        'status': 'ok',
        'claimed': len(claimed_orders),
        'orders': claimed_orders,
    }, ensure_ascii=False)}")


if __name__ == "__main__":
    # 全局超时300秒：重试机制可能延长执行时间（每次重试间隔60秒）
    try:
        asyncio.run(asyncio.wait_for(main(), timeout=300))
    except asyncio.TimeoutError:
        print("[ERROR] 脚本执行超时（300秒），可能浏览器卡死")
        cleanup_orphan_chromium()
