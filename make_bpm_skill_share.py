# -*- coding: utf-8 -*-
"""生成可分享给同事的 BPM 审批技能包（自包含 / 去个人化 / 路径可配置）。

只做本地文件生成与打包：不访问 BPM、不执行任何审批、不写 C 盘。
用法：python make_bpm_skill_share.py
产出：E:\\workbuddy\\Claw\\exports\\bpm-approval-share.zip
"""
import os, pathlib, shutil, zipfile

ROOT = pathlib.Path(r'E:\workbuddy\Claw')
SRC = ROOT / '.workbuddy' / 'scripts'
EXP = ROOT / 'exports'
BUILD = EXP / 'bpm-approval-share'
PKG = BUILD / 'bpm-approval'
ZIP = EXP / 'bpm-approval-share.zip'

CHROME_NEW = "...(process.env.BPM_CHROME ? { executablePath: process.env.BPM_CHROME } : {}),"
HELPER = (
    "const path = require('path');\n"
    "const OUT_DIR = process.env.BPM_OUTPUT_DIR || path.join(__dirname, '..', 'bpm_output');\n"
    "try { require('fs').mkdirSync(OUT_DIR, { recursive: true }); } catch (e) {}\n"
)


def portablize(name):
    """读入权威脚本，把本机硬编码路径替换为可配置 / 相对路径。返回 (文本, 替换计数)。"""
    text = (SRC / name).read_text(encoding='utf-8-sig')
    out, hits = [], 0

    def bump():
        nonlocal hits
        hits += 1

    for line in text.splitlines():
        # 1) 去掉写死在某台电脑上的 chromium 路径 -> 用 env 或 Playwright 自带浏览器
        if 'executablePath:' in line and ('chenjialin3' in line or 'ms-playwright' in line):
            out.append(line[:len(line) - len(line.lstrip())] + CHROME_NEW)
            bump()
            continue
        # 2) fs 引入后补 path / OUT_DIR / 建目录（只加一次）
        if name == 'bpm_approve_v22.js' and line.strip() == "const fs = require('fs');":
            out.append(line)
            out.extend(HELPER.rstrip('\n').split('\n'))
            bump()
            continue
        if name == 'bpm_query_worklist.js' and line.startswith("const { chromium } = require('playwright');"):
            out.append(line)
            out.extend(HELPER.rstrip('\n').split('\n'))
            bump()
            continue
        # 3) 截图路径 -> OUT_DIR
        if 'page.screenshot' in line and 'E:/workbuddy/Claw/reports/approve_' in line:
            indent = line[:len(line) - len(line.lstrip())]
            out.append(indent + "try { await page.screenshot({ path: path.join(OUT_DIR, 'approve_' + task.SN + '_done.png'), timeout: 20000 }); } catch (e) {}")
            bump()
            continue
        # 4) 结果文件 -> OUT_DIR
        if "fs.writeFileSync('E:" in line and 'approve_result.json' in line:
            indent = line[:len(line) - len(line.lstrip())]
            out.append(indent + "fs.writeFileSync(path.join(OUT_DIR, 'approve_result.json'),")
            bump()
            continue
        if 'bpm_output' in line and 'worklist.json' in line and 'writeFileSync' not in line:
            indent = line[:len(line) - len(line.lstrip())]
            out.append(indent + "path.join(OUT_DIR, 'worklist.json'),")
            bump()
            continue
        out.append(line)
    return '\n'.join(out) + '\n', hits


SKILL_MD = '''---
name: bpm-approval
display_name: BPM 待办审批
display_name_en: BPM Task Approval
description: "在公司 BPM 平台（bpm.timesgroup.cn）把待办审批流程点「同意」通过。仅当用户明确要求审批、通过、同意某条或某批流程时触发，例如「把调班申请审批通过」「把待办都同意了」「这几条流程批一下」。用户说「查一下流程」「看一下待办」「只是看看」时只查询、绝不审批。"
description_zh: "查询 BPM 待办并按关键词批量/单条点「同意」，内置盖章类排除与执行后复核。"
description_en: "Query BPM pending tasks and approve them with a keyword filter; excludes seal requests and verifies results."
version: 1.0.0
author: "Claw（公司内部自用）"
agent_created: true
examples_zh:
  - "把调班申请审批通过"
  - "看一下现在有哪些待办（只查询）"
  - "把这几条流程批一下"
examples_en:
  - "Approve the shift-change request"
  - "List pending approvals (read only)"
---

# BPM 待办审批

> **仅限公司内部使用，请勿外发。** 本技能包**不含任何账号密码**；登录使用各自 Windows 域账号（NT 认证），能看到和能审批哪些单由各自账号权限决定。
> 本技能只提供方法与规矩，**不会定时自动审批**；无人值守定时执行请用「自动化 / 计划任务」来触发。

## 1. 前置条件（每位同事首次使用前必须满足）

| 项 | 要求 |
|---|---|
| 网络 | 能访问公司内网 `http://bpm.timesgroup.cn`（**只能 http**，https 会跳登录页） |
| 账号 | 用**本人** Windows 域账号登录电脑，且该账号在 BPM 有审批权限 |
| 运行时 | 已安装 WorkBuddy、Node.js 18+，并且 `require('playwright')` 可用（`npm i playwright`，或设 `NODE_PATH` 指向已有 node_modules） |
| 浏览器 | 已装 Playwright Chromium（`npx playwright install chromium`）；如需指定浏览器，设 `BPM_CHROME=<chrome.exe 完整路径>` |
| 输出目录 | 默认写到技能目录下 `bpm_output/`，可用 `BPM_OUTPUT_DIR` 改到其他位置 |

可选环境变量：

| 变量 | 作用 | 默认 |
|---|---|---|
| `BPM_CHROME` | 指定 chromium/chrome 可执行文件 | 不设 = 用 Playwright 自带浏览器 |
| `BPM_OUTPUT_DIR` | 结果 JSON 与截图目录 | `<技能目录>/bpm_output/` |
| `NODE_PATH` | playwright 模块所在 node_modules | 按 Node 默认查找 |

## 2. 触发 / 不触发

| 用户说法 | 动作 |
|---|---|
| 「把调班申请审批通过」「几条流程批一下」「待办都同意了」 | 走 §5 审批流程 |
| 「查一下流程」「看一下待办」「只是看看」「最新 X 条」 | **只查询，绝不点同意** |
| 文件盖章、用印类流程 | **一律不自动审批**，即使在待办里也跳过 |

## 3. 硬规则

1. **盖章类排除**：`bpm_approve_v22.js` 已按 `Desc` / `Title` 含「盖章」硬过滤，不要删掉这层。
2. **「只是看看」= 只读**，不产生任何写操作。
3. 审批结果**只在 WorkBuddy 窗口回一条**，不发邮件、不群机器人推送、不做外部通知。
4. **执行完必须复核**（待办数变化 + `approve_result.json`），复核后再回报。
5. 后台跑完**第一时间在窗口主动说一声**，不等用户来问。
6. 否定结论（没有待办 / 查不到）要标注查询范围与可信度。
7. 先拉清单再动手；**不做接口探测轰炸、不并发请求**，避免触发系统防刷。
8. **审批是不可逆业务动作**：优先带关键词，避免误批其它单；不传参 = 审批全部待办，务必先确认范围。

## 4. 脚本与调用

所有命令在技能目录的 `scripts/` 下执行：

```bash
cd <技能目录>/scripts
node bpm_todo_list.js                 # 拉待办清单（只查询）
node bpm_query_worklist.js            # 导出 bpm_output/worklist.json（只查询）
node bpm_approve_v22.js "调班"        # 审批；关键词匹配 Description / TaskTitle
```

- 约 1.5~2 分钟/条，建议后台运行
- 结果写到 `bpm_output/approve_result.json`（含 `results`、`finalCount`、`final`）
- 复核用 v22 自带的 final 轮询 + 再跑一次 `bpm_todo_list.js`

## 5. 标准流程

1. 拉待办 → 列出清单（序号 / 流水号 / 流程名 / 发起人 / 当前节点）
2. 标出并**剔除盖章类**，确认本次范围
3. 后台跑 `bpm_approve_v22.js`（优先带关键词）
4. 读 `approve_result.json`，逐条确认 ✅ / ❌
5. 再拉一次待办复核条数变化（例如 3 → 0），异常则回查
6. 窗口回一条表格：流水号 / 流程类型 / 申请人 / 结果 + 剩余待办条数

## 6. 已知坑（改脚本前先看）

1. 表单 iframe **30~60 秒**才加载完，固定等 12s 必失败；必须轮询 `readyState` 且正文含「流水号 / 审批 / 申请」。
2. ExtJS 按钮要跨 `page.frames()` 找并用真实鼠标事件 / DOM 混合定位；纯 `el.click()` 不可靠。
3. 审批意见面板是**页面内联展开**，不是 `.x-window` 弹窗。
4. 表单 URL 必须同时带 `TaskID`、`StepID`、`pid`（= `StepID`）、`state`。
5. 提交后「正在提交…」遮罩期间**绝不跳转或关页面**，否则中断提交、误判失败，重跑可能重复审批；应就地 `fetch GetWorkList` 轮询 SN 消失（≤150s）。
6. 二次确认弹窗只从 `.x-window` / `.x-message-box` / `.x-tip` 找「确定」。
7. 所有 Playwright 脚本必须 `safeClose()`（close + kill pid），否则残留 chromium 进程。
8. 只对有「同意」按钮的任务有效；「发起人送件」等节点逻辑不同，不要硬套。

## 7. 参考

@references/bpm_approve_flow.md —— 主审批脚本的 10 步核心流程。
'''

README = '''# BPM 待办审批技能包 · 给同事的说明

## 这是什么

一个 WorkBuddy 技能包，把「查 BPM 待办 → 按关键词筛选 → 点同意 → 复核结果」这套流程固化下来。装上以后，在对话里说「把调班申请审批通过」「看一下有哪些待办」就会自动按固定规矩执行。

**内含**：`SKILL.md`（技能定义与规矩）、`scripts/`（3 个可直接运行的 Node 脚本）、`references/`（脚本流程说明）。
**不含**：任何账号、密码、token、个人目录；登录用你自己的 Windows 域账号。

## 怎么装（二选一）

1. **推荐**：WorkBuddy 左侧「专家·技能·连接器」→「技能」→「已安装」→「添加技能」→「**上传技能**」，选中 `bpm-approval-share.zip`，导入后自动完成配置。
2. 手动：把 zip 解压，将里面的 `bpm-approval/` 整个目录放到工作区的 `.workbuddy/skills/` 下。

> 装完建议**开一个新对话**再使用，让技能被重新扫描加载。

## 第一次用之前，请确认 4 件事

1. 电脑能打开 `http://bpm.timesgroup.cn`（公司内网，只能 http）
2. 用**你自己的** Windows 域账号登录着，且该账号在 BPM 有审批权限
3. 装了 Node.js 18+ 和 playwright（在 `scripts/` 目录下执行 `node -e "require('playwright')"` 不报错即可）
4. 装了 Playwright Chromium：`npx playwright install chromium`；若公司已有指定浏览器，设环境变量 `BPM_CHROME` 指向它的 `chrome.exe`

跑不通时先试只读脚本，不会改动任何流程：

```bash
cd <技能目录>/scripts
node bpm_todo_list.js
```

## 可选环境变量

| 变量 | 说明 |
|---|---|
| `BPM_CHROME` | 指定 chromium/chrome 完整路径；不设则用 Playwright 自带浏览器 |
| `BPM_OUTPUT_DIR` | 结果 JSON / 截图输出目录，默认 `<技能目录>/bpm_output/` |
| `NODE_PATH` | playwright 所在 `node_modules` 路径（模块找不到时才需要设） |

## 安全与边界（请务必看）

- **审批是不可逆的业务动作**，请先用只读脚本看清待办，再带关键词审批，不要一上来就跑「全部」。
- 含「**盖章**」的流程被脚本硬排除，**不会自动审批**；需要单独明确指示。
- 说「只是看看 / 查一下流程」时技能**只查询、不操作**。
- 结果只在 WorkBuddy 窗口回报，不发邮件、不推群。
- 各自账号权限不同，看到的待办也不同；审批行为由操作人自己负责。
- 本包是**同事间内部自用**，非公司官方发布，请勿外发到公司外部或公网。

## 常见问题

- **找不到 playwright 模块** → `npm i playwright`，或设 `NODE_PATH` 指向已有 `node_modules`。
- **浏览器启动失败** → `npx playwright install chromium`，或设 `BPM_CHROME`。
- **点了同意没反应** → 表单 iframe 加载慢（30~60s），脚本已做轮询；别把等待时间调短。
- **日志报 ❌ 但单子其实批了** → 提交遮罩期间跳转会误判；脚本已改为就地轮询 SN 消失，请勿改回跳转验证。
'''


def main():
    if BUILD.exists():
        shutil.rmtree(BUILD)
    (PKG / 'scripts').mkdir(parents=True)
    (PKG / 'references').mkdir(parents=True)

    expect = {'bpm_approve_v22.js': 4, 'bpm_todo_list.js': 1, 'bpm_query_worklist.js': 3}
    for name, need in expect.items():
        text, hits = portablize(name)
        if hits < need:
            raise SystemExit('ERR %s 只替换了 %d 处（预期 %d），拒绝生成不完整的包' % (name, hits, need))
        (PKG / 'scripts' / name).write_text(text, 'utf-8')
        print('PORTABLE %-28s 替换 %d 处' % (name, hits))

    shutil.copy2(SRC / 'bpm_approve_flow.md', PKG / 'references' / 'bpm_approve_flow.md')
    (PKG / 'SKILL.md').write_text(SKILL_MD, 'utf-8')
    (PKG / 'README_给同事.md').write_text(README, 'utf-8')

    if ZIP.exists():
        ZIP.unlink()
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(PKG.rglob('*')):
            if f.is_file():
                z.write(f, 'bpm-approval/' + f.relative_to(PKG).as_posix())

    # 静态自检：分享包不得残留个人路径 / 账号 / 密码字面量
    bad = ['chenjialin3', r'C:\Users', r'E:\workbuddy', 'C870409', 'Ysy042007']
    dirty = []
    for f in PKG.rglob('*'):
        if f.is_file() and f.suffix.lower() in ('.js', '.md'):
            t = f.read_text('utf-8', errors='replace')
            for k in bad:
                if k in t:
                    dirty.append('%s -> %s' % (f.name, k))
    print('\n=== 打包结果 ===')
    print('zip =', ZIP, '|', ZIP.stat().st_size, 'B')
    with zipfile.ZipFile(ZIP) as z:
        for n in z.namelist():
            print('  ', n, z.getinfo(n).file_size, 'B')
    print('\n=== 敏感/个人路径残留 ===')
    print('  ', dirty if dirty else '无（通过）')
    if dirty:
        raise SystemExit('ERR 存在个人路径残留，请检查后再分享')


if __name__ == '__main__':
    main()
