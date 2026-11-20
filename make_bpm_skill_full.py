# -*- coding: utf-8 -*-
"""
构建「零外部依赖」BPM 审批技能包（全部产出写 E 盘）。
- 内置便携 Node、playwright/playwright-core、Chromium
- 3 个脚本注入账号密码登录模块
- 统一入口 run.js（check / todo / worklist / approve）
- 不访问 BPM、不写 C 盘、包内不含任何真实账号密码
"""
import os, sys, json, shutil, pathlib, zipfile, time

BASE = pathlib.Path(r'E:\workbuddy\Claw\exports')
SRC = BASE / 'bpm-approval-share' / 'bpm-approval'
OUT = BASE / 'bpm-approval-full' / 'bpm-approval'
ZIP = BASE / 'bpm-approval-full.zip'

NODE_EXE = pathlib.Path(r'C:\Users\chenjialin3\.workbuddy\binaries\node\versions\22.22.2-6\node.exe')
NM = pathlib.Path(r'C:\Users\chenjialin3\.workbuddy\binaries\node\workspace\node_modules')
CHROMIUM = pathlib.Path(r'C:\Users\chenjialin3\.workbuddy\binaries\playwright-browsers\chromium-1228')

def log(m): print('[build] ' + m, flush=True)

BPM_LOGIN_JS = r'''// BPM 账号密码登录模块（分享版新增）
// 凭据由 run.js 从环境变量或 config/credentials.json 注入到 process.env。
// 若同事电脑用 Windows 域集成认证直接进了 BPM（不出现登录框），本模块自动跳过。
const USER_SELECTORS = ['input[placeholder="账号"]', 'input[placeholder="请输入账号"]',
  'input[name="username"]', 'input[id="username"]', '#username'];
const PASS_SELECTORS = ['input[placeholder="密码"]', 'input[placeholder="请输入密码"]',
  'input[name="password"]', 'input[id="password"]', '#password'];

async function findInput(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) return loc;
  }
  return null;
}

async function ensureLogin(page, log) {
  log = log || (m => console.log(m));
  let userInput = null;
  for (let i = 0; i < 20; i++) {
    userInput = await findInput(page, USER_SELECTORS);
    if (userInput) break;
    await page.waitForTimeout(1000);
  }
  if (!userInput) {
    log('  [登录] 未出现登录表单（域集成认证或已有会话），跳过账号密码登录');
    return 'skip';
  }
  const passInput = await findInput(page, PASS_SELECTORS);
  const u = process.env.BPM_USER || '';
  const p = process.env.BPM_PASS || '';
  if (!passInput || !u || !p) {
    throw new Error('检测到 BPM 登录页，但缺少账号或密码。请在对话里把账号密码告诉 WorkBuddy，或写入 config/credentials.json');
  }
  log('  [登录] 检测到登录页，正在用提供的账号密码登录...');
  for (let attempt = 1; attempt <= 2; attempt++) {
    await userInput.fill(u, { timeout: 15000 });
    await passInput.fill(p, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const texts = ['登 录', '登录', '登  录', 'Login', '登　录'];
      for (const el of document.querySelectorAll('a,button,span,div,input[type=submit]')) {
        const t = (el.innerText || el.value || '').trim();
        if (texts.indexOf(t) >= 0 && el.children.length <= 2) { el.click(); return; }
      }
      const f = document.querySelector('form');
      if (f) f.submit();
    });
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      // 判据 1：登录表单消失。不能只看 URL —— BPM 登录页 URL 未必含 login，
      // 否则密码错了也会误判成功，后续会把「没拿到数据」错报成「没有待办」。
      if (!(await findInput(page, USER_SELECTORS))) { log('  [登录] 成功（表单已消失）'); return 'ok'; }
      // 判据 2：表单 DOM 仍在但业务接口已返回 JSON（部分 SPA 版本不销毁表单）
      let apiOk = false;
      try {
        apiOk = await page.evaluate(async () => {
          const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
          const t = await r.text();
          return r.status === 200 && /^\s*[\{\[]/.test(t);
        });
      } catch (e) {}
      if (apiOk) { log('  [登录] 成功（业务接口已可用）'); return 'ok'; }
      // 页面已明确报错就立刻失败，不白等 30 秒
      const err = await page.evaluate(() => {
        const t = document.body.innerText || '';
        const m = t.match(/账号或密码错误|用户名或密码错误|密码错误|用户不存在|登录失败|验证码错误|账号已被锁定/);
        return m ? m[0] : '';
      }).catch(() => '');
      if (err) throw new Error('BPM 登录失败：' + err + '（请核对账号密码大小写与末尾符号）');
    }
    log('  [登录] 第 ' + attempt + ' 次未成功，重试');
  }
  throw new Error('BPM 账号密码登录失败（仍停留在登录页），请检查账号密码是否正确');
}

module.exports = { ensureLogin };
'''

RUN_JS = r'''// BPM 审批技能包 · 统一入口（零外部依赖）
// 用法: runtime\node.exe run.js check | todo | worklist | approve "关键词"
const path = require('path');
const fs = require('fs');
const ROOT = __dirname;
const CHROME = path.join(ROOT, 'runtime', 'browsers', 'chromium-1228', 'chrome-win64', 'chrome.exe');
const NM = path.join(ROOT, 'node_modules');
const CRED = path.join(ROOT, 'config', 'credentials.json');

// 1) 包内浏览器（脚本已支持 BPM_CHROME）
if (!process.env.BPM_CHROME && fs.existsSync(CHROME)) process.env.BPM_CHROME = CHROME;
// 2) 包内 playwright 模块
if (fs.existsSync(NM)) { process.env.NODE_PATH = NM; require('module').Module._initPaths(); }
// 3) 账号密码：环境变量优先，其次本地配置；绝不写进技能包
let credSource = '环境变量';
if ((!process.env.BPM_USER || !process.env.BPM_PASS) && fs.existsSync(CRED)) {
  try {
    const c = JSON.parse(fs.readFileSync(CRED, 'utf8'));
    if (c.user && c.password) {
      process.env.BPM_USER = String(c.user);
      process.env.BPM_PASS = String(c.password);
      credSource = 'config/credentials.json';
    }
  } catch (e) { console.error('[配置] credentials.json 解析失败: ' + e.message); }
}
// 4) 输出目录
if (!process.env.BPM_OUTPUT_DIR) process.env.BPM_OUTPUT_DIR = path.join(ROOT, 'bpm_output');
try { fs.mkdirSync(process.env.BPM_OUTPUT_DIR, { recursive: true }); } catch (e) {}

const USAGE = [
  '用法: runtime/node.exe run.js <命令> [参数]',
  '  check             自检运行时（不访问 BPM）',
  '  todo              拉待办清单（只查询）',
  '  worklist          导出 bpm_output/worklist.json（只查询）',
  '  approve "关键词"  审批匹配的待办（盖章类自动排除）'
].join('\n');

async function runCheck() {
  let failed = false;
  const ok = m => console.log('  [OK]   ' + m);
  const bad = m => { console.log('  [FAIL] ' + m); failed = true; };
  console.log('=== BPM 技能包运行时自检（不访问 BPM）===');
  ok('Node ' + process.version + '（包内便携版）');
  if (fs.existsSync(CHROME)) ok('Chromium 已内置'); else bad('缺少 Chromium: ' + CHROME);
  let pw = null;
  try {
    pw = require('playwright');
    const v = require(path.join(NM, 'playwright', 'package.json')).version;
    ok('playwright 模块已内置 v' + v);
  } catch (e) { bad('playwright 模块加载失败: ' + e.message); }
  if (pw && fs.existsSync(CHROME)) {
    let b = null;
    try {
      b = await pw.chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
      const pg = await b.newPage();
      await pg.setContent('<html><body>runtime-ok</body></html>');
      const t = (await pg.textContent('body')).trim();
      ok('Chromium 实际启动并渲染页面成功: ' + t);
      await b.close(); b = null;
    } catch (e) {
      bad('Chromium 启动失败: ' + e.message);
      if (b) await b.close().catch(() => {});
    }
  }
  if (process.env.BPM_USER && process.env.BPM_PASS) ok('已读到账号密码（来源：' + credSource + '，不显示明文）');
  else console.log('  [i]    尚未提供账号密码 —— 在对话里把账号密码告诉 WorkBuddy 即可；若域集成认证可直接进也可忽略');
  console.log(failed ? '\n自检未通过，请查看上面的 [FAIL]。' : '\n自检通过：运行时零依赖可用，全程未访问 BPM。');
  return failed ? 1 : 0;
}

(async () => {
  const args = process.argv.slice(2);
  const cmd = (args[0] || '').toLowerCase();
  if (cmd === 'check') { process.exitCode = await runCheck(); return; }
  const MAP = { todo: 'bpm_todo_list.js', worklist: 'bpm_query_worklist.js', approve: 'bpm_approve_v22.js' };
  if (!MAP[cmd]) { console.log(USAGE); process.exitCode = 1; return; }
  if (!process.env.BPM_USER || !process.env.BPM_PASS) {
    console.log('[配置] 尚未提供 BPM 账号密码；若出现登录页会报错。请在对话里告诉 WorkBuddy 账号密码，或写 config/credentials.json。');
  }
  const target = path.join(ROOT, 'scripts', MAP[cmd]);
  process.argv = [process.argv[0], target].concat(args.slice(1));
  require(target);
})().catch(e => { console.error('[运行失败] ' + e.message); process.exitCode = 1; });
'''

CHECK_BAT = '''@echo off\r
setlocal\r
"%~dp0runtime\\node.exe" "%~dp0run.js" check\r
echo.\r
pause\r
'''


def write(p, text, ascii_bat=False):
    p.parent.mkdir(parents=True, exist_ok=True)
    if ascii_bat:
        p.write_bytes(text.encode('ascii'))
    else:
        p.write_text(text, encoding='utf-8')


def inject(src_text, old, new, label):
    n = src_text.count(old)
    if n != 1:
        raise RuntimeError('%s: 锚点出现 %d 次，无法安全注入' % (label, n))
    log('  注入登录模块 -> ' + label)
    return src_text.replace(old, new, 1)


def main():
    log('源分享包 = %s' % SRC)
    log('输出目录 = %s' % OUT)
    if not SRC.is_dir():
        raise RuntimeError('找不到现有分享包：%s' % SRC)
    for p in (NODE_EXE, NM / 'playwright', NM / 'playwright-core', CHROMIUM):
        if not p.exists():
            raise RuntimeError('缺少运行时依赖：%s' % p)

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    # ---- 1. 复制并注入脚本 ----
    scripts = OUT / 'scripts'
    scripts.mkdir()
    refs = OUT / 'references'
    refs.mkdir()
    shutil.copy2(SRC / 'references' / 'bpm_approve_flow.md', refs / 'bpm_approve_flow.md')

    v22 = (SRC / 'scripts' / 'bpm_approve_v22.js').read_text(encoding='utf-8')
    v22 = inject(v22,
        "    await wait(14000);\n",
        "    await wait(14000);\n    await require('./bpm_login').ensureLogin(page, log);\n",
        'bpm_approve_v22.js')

    todo = (SRC / 'scripts' / 'bpm_todo_list.js').read_text(encoding='utf-8')
    todo = inject(todo,
        "    await sleep(8000);\n",
        "    await sleep(8000);\n    await require('./bpm_login').ensureLogin(page, log);\n",
        'bpm_todo_list.js')

    qry = (SRC / 'scripts' / 'bpm_query_worklist.js').read_text(encoding='utf-8')
    qry = inject(qry,
        "    await wait(12000);\n",
        "    await wait(12000);\n    await require('./bpm_login').ensureLogin(page, m => console.log(m));\n",
        'bpm_query_worklist.js')

    write(scripts / 'bpm_approve_v22.js', v22)
    write(scripts / 'bpm_todo_list.js', todo)
    write(scripts / 'bpm_query_worklist.js', qry)
    write(scripts / 'bpm_login.js', BPM_LOGIN_JS)
    write(OUT / 'run.js', RUN_JS)
    write(OUT / 'check.bat', CHECK_BAT, ascii_bat=True)

    # ---- 2. 配置模板（不含真实凭据）----
    write(OUT / 'config' / 'credentials.example.json',
          json.dumps({'user': '你的域账号', 'password': '你的密码'}, ensure_ascii=False, indent=2) + '\n')
    write(OUT / 'config' / '说明.txt',
          '本目录用于存放本机账号密码，禁止外发。\n'
          '方式一（推荐、不落盘）：在 WorkBuddy 对话里把账号密码告诉它，由它通过环境变量传给 run.js。\n'
          '方式二（一次配置）：把 credentials.example.json 复制为 credentials.json 并填入账号密码；\n'
          '                    run.js 会自动读取。该文件仅存本机，打包/分享前务必删除。\n')

    # ---- 3. 运行时 ----
    log('复制便携 Node (84MB) ...')
    (OUT / 'runtime').mkdir(exist_ok=True)
    shutil.copy2(NODE_EXE, OUT / 'runtime' / 'node.exe')
    log('复制 playwright 模块 ...')
    for name in ('playwright', 'playwright-core'):
        shutil.copytree(NM / name, OUT / 'node_modules' / name, dirs_exist_ok=True)
    log('复制 Chromium (416MB，约 1-2 分钟) ...')
    shutil.copytree(CHROMIUM, OUT / 'runtime' / 'browsers' / 'chromium-1228', dirs_exist_ok=True)

    # ---- 4. 文档 ----
    write(OUT / 'SKILL.md', SKILL_MD)
    write(OUT / 'README_给同事.md', README_MD)

    # ---- 5. 打包 ----
    log('开始打包 zip（约 200MB，请稍候）...')
    t0 = time.time()
    if ZIP.exists():
        ZIP.unlink()
    n = 0
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in sorted(OUT.rglob('*')):
            if not f.is_file():
                continue
            rel = f.relative_to(OUT.parent).as_posix()
            if rel.endswith('credentials.json') or '/bpm_output/' in rel:
                continue
            z.write(f, rel)
            n += 1
    log('打包完成：%d 个文件，%.1f MB，耗时 %.1fs' % (n, ZIP.stat().st_size / 1048576, time.time() - t0))

    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    log('技能目录原始体积：%.1f MB' % (total / 1048576))
    print(json.dumps({'dir': str(OUT), 'zip': str(ZIP), 'files': n,
                      'zip_mb': round(ZIP.stat().st_size / 1048576, 1)}, ensure_ascii=False))


SKILL_MD = r'''---
name: bpm-approval
display_name: BPM 待办审批（零依赖版）
display_name_en: BPM Task Approval (Portable)
description: "在公司 BPM 平台（bpm.timesgroup.cn）把待办审批流程点「同意」通过。技能包已内置 Node.js、playwright 与 Chromium，安装后无需下载安装任何依赖，用户只需提供 BPM 账号密码即可运行。仅当用户明确要求审批、通过、同意某条或某批流程时触发，例如「把调班申请审批通过」「把待办都同意了」。用户说「查一下流程」「看一下待办」「只是看看」时只查询、绝不审批。"
description_zh: "零依赖 BPM 待办审批：内置运行时，给账号密码即可跑；含盖章类排除与执行后复核。"
description_en: "Portable BPM approval skill with bundled runtime; excludes seal requests and verifies results."
version: 2.0.0
author: "Claw（公司内部自用）"
agent_created: true
examples_zh:
  - "把调班申请审批通过"
  - "看一下现在有哪些待办（只查询）"
  - "我的BPM账号是 xxx，密码是 yyy，把待办批一下"
examples_en:
  - "Approve the shift-change request"
  - "List pending approvals (read only)"
---

# BPM 待办审批（零依赖版）

> **仅限公司内部使用，请勿外发。** 包内**不含任何真实账号密码、个人目录或 token**。
> 已内置 Node.js、playwright、Chromium，**同事不需要下载或安装任何东西**；也不再要求 Node 18+ / npx playwright install。

## 0. 安装后只需一件事：给账号密码

用户在对话里给出 BPM 账号密码后，按下面任一方式传给脚本（**优先方式一**）：

**方式一：环境变量（推荐，不落盘）**
```bash
BPM_USER='<用户给的账号>' BPM_PASS='<用户给的密码>' "<技能目录>/runtime/node.exe" "<技能目录>/run.js" todo
```
密码只在本次命令中传递，不写文件。当前会话内后续命令沿用同一组值即可。

**方式二：一次配置（可选）**
用户说「记住」时，把 `config/credentials.example.json` 复制为 `config/credentials.json`，填入 `{"user":"...","password":"..."}`；`run.js` 会自动读取。**必须提醒用户：该文件只存本机，禁止随技能包外发或放共享盘。**

若同事电脑用 Windows 域集成认证能直接进 BPM（不出现登录框），`bpm_login.js` 会自动跳过账号密码登录，此时不给账号密码也能跑。

**绝不**把真实账号密码写进 `SKILL.md`、README、脚本默认值或任何会打包/分享的文件。

## 1. 安装与首次自检

1. WorkBuddy 左侧「技能 → 添加技能 → 上传技能」选中 `bpm-approval-full.zip`；或手动解压到工作区 `.workbuddy/skills/`。
2. 装完建议**开一个新对话**让技能重新扫描加载。
3. 首次自检（**不访问 BPM**，只验证内置运行时）：
```bash
"<技能目录>/runtime/node.exe" "<技能目录>/run.js" check
```
也可直接双击技能目录下的 `check.bat`。全部 `[OK]` 才继续。

> ⚠️ 本包约 200MB（含 Chromium）。若 WorkBuddy 上传技能对大包有限制，改用手动解压方式，效果完全一致。

## 2. 命令（所有路径都用包内运行时，不要改用系统 node）

```bash
"<技能目录>/runtime/node.exe" "<技能目录>/run.js" check               # 自检，不访问 BPM
"<技能目录>/runtime/node.exe" "<技能目录>/run.js" todo                # 拉待办清单（只查询）
"<技能目录>/runtime/node.exe" "<技能目录>/run.js" worklist            # 导出 worklist.json（只查询）
"<技能目录>/runtime/node.exe" "<技能目录>/run.js" approve "调班"      # 审批匹配项
```
`run.js` 自动完成：指向包内 Chromium、加载包内 playwright、注入账号密码、创建 `bpm_output/`。
可选环境变量：`BPM_CHROME`（覆盖浏览器路径）、`BPM_OUTPUT_DIR`（覆盖输出目录）、`BPM_BASE`（覆盖站点地址）。

## 3. 触发 / 不触发

| 用户说法 | 动作 |
|---|---|
| 「把调班申请审批通过」「几条流程批一下」「待办都同意了」 | 走 §5 审批流程 |
| 「查一下流程」「看一下待办」「只是看看」「最新 X 条」 | **只查询，绝不点同意** |
| 文件盖章、用印类流程 | **一律不自动审批**，即使在待办里也跳过 |

## 4. 硬规则

1. **盖章类排除**：`bpm_approve_v22.js` 已按 `Desc` / `Title` 含「盖章」硬过滤，不要删掉这层。
2. **「只是看看」= 只读**，不产生任何写操作。
3. 审批结果**只在 WorkBuddy 窗口回一条**，不发邮件、不群机器人推送、不做外部通知。
4. **执行完必须复核**（待办数变化 + `approve_result.json`），复核后再回报。
5. 后台跑完**第一时间在窗口主动说一声**，不等用户来问。
6. 否定结论（没有待办 / 查不到）要标注查询范围与可信度。
7. 先拉清单再动手；**不做接口探测轰炸、不并发请求、不做自动重试**，避免触发系统防刷（曾因密集请求把出口 IP 拉进黑名单）。
8. **审批是不可逆业务动作**：优先带关键词，避免误批其它单；不传参 = 审批全部待办，务必先确认范围。
9. 业务操作已全权授权，**不中途询问「是否允许」**；但上述规范不因此改变。

## 5. 标准流程

1. 拉待办 → 列出清单（序号 / 流水号 / 流程名 / 发起人 / 当前节点）
2. 标出并**剔除盖章类**，确认本次范围
3. 后台跑 `approve`（优先带关键词）
4. 读 `bpm_output/approve_result.json`，逐条确认 ✅ / ❌
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
9. 登录表单用 `input[placeholder="账号"]` / `["密码"]` 定位；若公司改版需同步改 `bpm_login.js` 的选择器数组。

## 7. 参考

@references/bpm_approve_flow.md —— 主审批脚本的 10 步核心流程。
'''

README_MD = r'''# BPM 待办审批技能包（零依赖版）· 给同事

## 一句话

**装上这个技能，除了告诉我你的 BPM 账号密码，什么都不用装、什么都不用配。**

包里已经自带：Node.js 运行环境、playwright 自动化库、Chromium 浏览器。不需要下载安装 Node、不需要 `npm i playwright`、不需要 `npx playwright install chromium`、不需要设任何环境变量、不需要改脚本路径。

## 怎么装

1. **推荐**：WorkBuddy 左侧「专家·技能·连接器 → 技能 → 已安装 → 添加技能 → 上传技能」，选 `bpm-approval-full.zip`。
2. 若提示包太大（本包约 200MB）：手动把 zip 解压，把里面的 `bpm-approval/` 整个目录放到工作区的 `.workbuddy/skills/` 下。
3. 装完**开一个新对话**再使用。

## 装完先自检一次（不访问 BPM，不改动任何流程）

双击技能目录里的 `check.bat`，或者在命令行执行：

```
"<技能目录>\runtime\node.exe" "<技能目录>\run.js" check
```

看到全部 `[OK]` 和「自检通过」就说明内置运行时可用。这一步只启动了一下自带浏览器打开空白页，**没有连公司 BPM**。

## 然后只需要给我账号密码

在新对话里说一句，例如：

> 我的 BPM 账号是 zhangsan，密码是 Abc123!，帮我看一下有哪些待办

我会把账号密码通过环境变量传给脚本，脚本自动登录、查待办、按规矩办事。密码**默认不写进任何文件**。

如果你希望以后都免得再输，可以说「记住这个账号密码」，我会写到技能目录的 `config/credentials.json`（只在你本机）。**这个文件千万不要随包发给别人、不要放共享盘。**

> 如果你们电脑用 Windows 域账号能直接打开 BPM 不用输密码，那连账号密码都不用给，脚本会自动跳过登录。

## 能做什么 / 不能做什么

| 说法 | 动作 |
|---|---|
| 「看一下有哪些待办」「只是看看」 | **只查询，不点任何按钮** |
| 「把调班申请审批通过」「把这几条批一下」 | 按关键词筛选后点「同意」 |
| 含「盖章」「用印」的流程 | **一律不自动审批**，需单独明确指示 |

审批结果只在 WorkBuddy 窗口回一条，不发邮件、不推企业微信群。每次批完会再查一次待办复核条数。

## 安全与边界

- 包内**不含任何真实账号、密码、token、个人目录**，各人能看到和能批的单由各自账号权限决定。
- **审批不可逆转**：先看清单再批，尽量带关键词，别一上来批「全部」。
- 能访问公司内网 `http://bpm.timesgroup.cn` 是唯一网络前提（**只能 http**）。
- 本包是**同事间内部自用**，非公司官方发布，请勿外发到公司外部或公网。
- 运行时是 Windows x64；其它系统需要自行换对应二进制。

## 出问题先自查

| 现象 | 处理 |
|---|---|
| `check` 里有 `[FAIL]` | 把整段输出发给我；常见是杀软拦截了内置 chrome.exe，加白名单即可 |
| 提示「检测到 BPM 登录页，但缺少账号或密码」 | 在对话里把账号密码给我，或填 `config/credentials.json` |
| 提示「账号密码登录失败」 | 核对大小写与末尾符号；密码常改，改完告诉我新的即可 |
| 点了同意没反应 | 表单 iframe 加载慢（30~60s），脚本已轮询，别把等待时间调短 |
| 说没有待办但你觉得不对 | 让我复核，我会标注查询范围与可信度 |

## 包里有什么

```
bpm-approval/
├── SKILL.md                    技能定义、触发规则、硬规则
├── README_给同事.md             本文件
├── run.js                      统一入口（check/todo/worklist/approve）
├── check.bat                   双击自检
├── runtime/
│   ├── node.exe                便携 Node.js
│   └── browsers/chromium-1228/  Chromium 浏览器
├── node_modules/               playwright + playwright-core
├── scripts/                    3 个业务脚本 + bpm_login.js 登录模块
├── references/                 脚本流程说明
└── config/                     凭据模板（不含真实密码）
```
'''


if __name__ == '__main__':
    main()
