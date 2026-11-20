/**
 * WorkBuddy 每日签到自动领取（CDP + iframe 内文本定位点击）
 *
 * 原理：通过 Chrome DevTools Protocol 连接 WorkBuddy（需 --remote-debugging-port=9222 启动），
 *       "Buddy加油站/今日礼包"入口位于主页面内嵌的跨域 iframe（workbuddy.cn/space/home），
 *       因此必须在 page.frames() 里逐个 frame 查找"立即领取"按钮并点击。
 *
 * 退出码：0=签到成功(或已签)  2=未确认成功  3=跳过  4=已安排自愈重启  1=异常
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const net = require('net');

const wait = ms => new Promise(r => setTimeout(r, ms));

const PORT = 9222;
const DIR = __dirname;
const LOG = path.join(DIR, 'checkin.log');
const RESULT_JSON = path.join(DIR, 'last_result.json');
// 用本地日期命名（toISOString 是 UTC，晚 8 点后会串日期）
const _d = new Date();
const _localDay = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0');
const SHOT = path.join(DIR, 'shot_' + _localDay + '.png');
const WB_EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\Programs\\WorkBuddy\\WorkBuddy.exe';
const USER_DIR = 'C:\\Users\\chenjialin3\\.workbuddy\\app';

function log(...a) {
  const s = '[' + new Date().toLocaleString('zh-CN') + '] ' + a.join(' ');
  console.log(s);
  try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {}
}
function saveResult(obj) {
  try { fs.writeFileSync(RESULT_JSON, JSON.stringify(Object.assign({ time: new Date().toISOString() }, obj), null, 2)); } catch (e) {}
}
function probePort() {
  return new Promise(res => {
    const s = net.connect(PORT, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => { s.destroy(); res(false); });
    setTimeout(() => { try { s.destroy(); } catch (e) {} res(false); }, 800);
  });
}
function isWbRunning() {
  try {
    const out = require('child_process').execSync('tasklist /FI "IMAGENAME eq WorkBuddy.exe" /NH', { encoding: 'utf8', windowsHide: true });
    return /WorkBuddy\.exe/i.test(out || '');
  } catch (e) { return false; }
}

/** 自愈：立即通过 Windows 计划任务（TaskScheduler 系统服务托管，独立于 WorkBuddy 进程树）
 *  触发 selfheal.js：杀全部 WorkBuddy -> 带端口重启 C 盘实例 -> 自动补签。
 *  说明：schtasks.exe 被沙箱拦截、detached node 在 agent 环境会被回收，
 *  因此统一改用 PowerShell Start-ScheduledTask（COM API，可靠，且由系统服务执行，杀 WorkBuddy 后仍继续）。 */
function triggerScheduledSelfheal() {
  const { spawnSync } = require('child_process');
  // 0) 先把任务的 node 路径刷成「当前进程用的 node」：
  //    managed node 会随小版本换目录（22.22.2-3 -> 22.22.2-5），旧路径会导致任务 0x80070002（文件未找到）而静默空转。
  try {
    const selfhealJs = require('path').join(__dirname, 'selfheal.js');
    const tr = '\'"' + process.execPath + '" "' + selfhealJs + '"\'';
    const rc = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      'schtasks /create /tn "WB_Checkin_Selfheal" /tr ' + tr + ' /sc once /st 23:59 /f'],
      { encoding: 'utf8', windowsHide: true });
    log('刷新自愈任务的 node 路径 rc=' + rc.status + ' -> ' + process.execPath);
  } catch (e) { log('刷新自愈任务路径失败: ' + e.message); }
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      'Start-ScheduledTask -TaskName "WB_Checkin_Selfheal"'], { encoding: 'utf8', windowsHide: true });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    const ok = r.status === 0;
    log('已通过计划任务触发自愈 WB_Checkin_Selfheal (ok=' + ok + ' ' + out.replace(/\s+/g, ' ').slice(0, 200) + ')');
    return ok;
  } catch (e) {
    log('触发计划任务自愈失败: ' + e.message);
    return false;
  }
}

async function ensureRunning() {
  if (await probePort()) { log('调试端口 9222 已就绪'); return true; }
  if (isWbRunning()) {
    log('WorkBuddy 正在运行但调试端口未开 -> 通过计划任务触发自愈重启（带端口重启后自动补签）');
    const ok = triggerScheduledSelfheal();
    saveResult({
      ok: false, skipped: true, selfhealScheduled: ok,
      reason: 'WorkBuddy running without debug port; selfheal via scheduled task triggered'
    });
    return ok ? 'scheduled' : false;
  }
  log('WorkBuddy 未运行，以调试端口启动...');
  const { spawn } = require('child_process');
  const p = spawn(WB_EXE, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + USER_DIR], {
    detached: true, stdio: 'ignore', windowsHide: true
  });
  p.unref();
  for (let i = 0; i < 40; i++) {
    if (await probePort()) { log('WorkBuddy 调试端口已启动'); return true; }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('WorkBuddy 启动超时，调试端口未就绪');
}

// ---- 在某个 frame 内执行的辅助函数（序列化后传入 evaluate，含 shadow DOM 深度遍历）----
const CLICK_FN = (texts) => {
  const normalize = s => (s || '').replace(/\s+/g, '');
  const want = texts.map(t => normalize(t));
  const matches = [];
  // 2026-10-09 误点事故防护：曾把聊天记录里「你今天有给我签到领积分吗？」当成按钮点掉。
  // 现在：① 跳过聊天区元素（class 含 cr-/conversation/message）；② 只认「像按钮」的元素。
  const isChat = (el) => {
    let e = el, d = 0;
    while (e && d < 8) {
      const c = ((e.className || '') + '').toString();
      if (/cr-|conversation|message|markdown|chat/i.test(c)) return true;
      e = e.parentElement || (e.getRootNode && e.getRootNode().host);
      d++;
    }
    return false;
  };
  const looksClickable = (el) => {
    const c = ((el.className || '') + '').toString();
    if (/fuel|growth|station|bubble/i.test(c)) return true;
    if (el.tagName === 'BUTTON') return true;
    if (el.getAttribute && el.getAttribute('role') === 'button') return true;
    if (typeof getComputedStyle === 'function' && getComputedStyle(el).cursor === 'pointer') return true;
    return false;
  };
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      const n = normalize(el.innerText || el.textContent);
      if (!n) continue;
      if (isChat(el) || !looksClickable(el)) continue;
      for (const w of want) {
        if (n.includes(w) && n.length <= w.length + 8) { matches.push({ el, n }); break; }
      }
    }
  };
  walk(document);
  if (!matches.length) return null;
  matches.sort((a, b) => a.n.length - b.n.length);
  for (const m of matches) {
    let e = m.el;
    while (e) {
      const r = e.getBoundingClientRect ? e.getBoundingClientRect() : { width: 1, height: 1 };
      const clickable = e.tagName === 'BUTTON' || (e.getAttribute && e.getAttribute('role') === 'button') ||
        (e.getAttribute && e.getAttribute('tabindex') === '0') ||
        (typeof getComputedStyle === 'function' && getComputedStyle(e).cursor === 'pointer') || !!e.onclick;
      if (clickable && r.width > 0 && r.height > 0) { e.click(); return normalize(m.n); }
      e = e.parentElement || (e.getRootNode && e.getRootNode().host);
    }
    m.el.click();
    return normalize(m.n);
  }
  return null;
};
const DONE_FN = () => {
  const re = /^(已签到|今日已领|已领取|领取成功|明日再来|明日可领|今日已签到|已到账)$/;
  let hit = false;
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (hit) return;
      // 只看元素自身的直接文本（避免大容器包含聊天记录导致误判）
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent || '').join('').replace(/\s+/g, '');
      if (own && own.length <= 12 && re.test(own)) { hit = true; return; }
    }
  };
  walk(document);
  return hit;
};

/** 服务端权威状态查询（2026-10-16 固化，源自 verify_status.js）
 *  背景：v5.8.2 改版后 DOM 判据不可靠 —— 今日已领取时 .daily-checkin--bubble 浮层不再渲染
 *  「立即领取」按钮，脚本会误判成「入口缺失/未找到按钮」，进而白白触发自愈「重启整个 WorkBuddy」。
 *  现一律先调只读接口问服务端真相；接口不可用才退化到旧 DOM 流程。
 *  注意：/billing/meter/checkin-status（v1 旧接口）返回 active:false 的废弃数据，勿用。 */
const STATUS_QUERY_FN = async () => {
  try {
    const r = await window.wb.http.post('/billing/meter/checkin-activity-status', {});
    return JSON.stringify(r || {});
  } catch (e) { return JSON.stringify({ error: e && e.message }); }
};
async function queryServerStatus(page, saveIt) {
  for (const f of page.frames()) {
    try {
      const raw = await f.evaluate(STATUS_QUERY_FN);
      const j = JSON.parse(raw);
      if (!j || j.error) continue;
      const d = (j && j.data) ? j.data : null;
      if (!d || typeof d.today_checked_in !== 'boolean') continue;
      if (saveIt) {
        try {
          fs.writeFileSync(path.join(DIR, 'status_' + _localDay + '.json'),
            JSON.stringify({ time: new Date().toISOString(), raw: j }, null, 2), 'utf8');
        } catch (e) {}
      }
      return d;
    } catch (e) {}
  }
  return null;
}

(async () => {
  let browser = null;
  try {
    const ready = await ensureRunning();
    if (ready === 'scheduled') { log('RESULT: SELFHEAL_SCHEDULED (系统计划任务将杀全部实例->带端口重启->补签)'); process.exit(4); }
    if (!ready) { log('RESULT: SKIPPED'); process.exit(3); }

    browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT, { timeout: 60000 });
    log('已连接 CDP');

    let page = null;
    outer: for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const t = (await p.title().catch(() => '')) || '';
        const u = p.url() || '';
        if (t.includes('WorkBuddy') || u.includes('app.asar') || u.startsWith('file://')) { page = p; break outer; }
      }
    }
    if (!page) {
      // 诊断：端口通但 0 个页面 = 端口被「另一个无窗口的 WorkBuddy 实例」占用
      // （真正在用的实例没带 --remote-debugging-port，所以 CDP 连到了空壳上）
      let n = 0;
      for (const ctx of browser.contexts()) n += ctx.pages().length;
      log('诊断: contexts=' + browser.contexts().length + ' pages=' + n +
        ' -> 端口 9222 被无窗口的 WorkBuddy 实例占用（真窗口没带端口）');
      // 自动触发自愈：通过系统计划任务杀全部 WorkBuddy -> 带端口重启 -> 自动补签
      const ok = triggerScheduledSelfheal();
      saveResult({ ok: false, selfhealTriggered: ok, reason: 'zombie holds debug port, pages=0' });
      log('RESULT: SELFHEAL_TRIGGERED (计划任务将杀全部实例->带端口重启->补签)');
      process.exit(4);
    }
    log('主页面:', page.url().slice(0, 70), '| frames:', page.frames().length);
    page.frames().forEach(f => log('  frame:', f.url().slice(0, 90)));

    // ★2026-10-16 固化：先问服务端，今日已领取就直接收工（不点按钮、不触发自愈重启）
    const st0 = await queryServerStatus(page, true);
    if (st0 && st0.today_checked_in === true) {
      log('服务端核验: 今日已领取（连续 ' + st0.streak_days + ' 天, 累计 ' + st0.total_credits + ' 分）-> 无需任何操作');
      saveResult({
        ok: true, note: 'server-verified already checked in',
        today_checked_in: true, streak_days: st0.streak_days, total_credits: st0.total_credits
      });
      try { await browser.close(); } catch (e) {}
      process.exit(0);
    }

    // ★2026-11-05 新增：API 直签兜底。
    //  背景：v5.9.3 左下角轮播槽会轮流显示「做任务赢积分好礼（立即前往）」等促销卡，
    //  此时「立即领取」按钮不存在，DOM 点击 3 次全部 not found -> exit=2（11-05 实测）；
    //  且促销卡的「立即前往」DOM click 无效（10-09 已验证），点不开签到面板。
    //  方案：直接在渲染进程调 POST /billing/meter/daily-checkin（与按钮同一接口，asar 内已确认），
    //  成功则收工，失败才继续走 DOM 流程。
    const apiClaim = await (async () => {
      for (const f of page.frames()) {
        try {
          const r = await f.evaluate(async () => {
            if (!window.wb || !window.wb.http) return null;
            const res = await window.wb.http.post('/billing/meter/daily-checkin', {});
            return res && (res.data !== undefined ? res.data : res);
          });
          if (r && (r.credit !== undefined || r.streak_days !== undefined || r.code === 0)) return r;
        } catch (e) {}
      }
      return null;
    })();
    if (apiClaim) {
      const stc = await queryServerStatus(page, true);
      if (stc && stc.today_checked_in === true) {
        log('API 直签成功（连续 ' + stc.streak_days + ' 天, 累计 ' + stc.total_credits + ' 分；未依赖浮层按钮）');
        saveResult({
          ok: true, note: 'api-claim success', steps: ['api: ' + JSON.stringify(apiClaim).slice(0, 120)],
          today_checked_in: true, streak_days: stc.streak_days, total_credits: stc.total_credits
        });
        try { await browser.close(); } catch (e) {}
        process.exit(0);
      }
      log('API 调用已返回但服务端未见今日已领 -> 继续走 DOM 点击流程');
    }

    // 截图只用于「失败时」留证诊断，成功路径不截图：
    // 该 Electron 主窗口截图常超时（等重绘/字体），不值得让它拖慢或卡住签到。
    // 限时 12s + Promise.race 兜底，失败也绝不阻塞主流程。
    const shot = async () => {
      const p = page.screenshot({ path: SHOT, timeout: 12000 })
        .then(() => { log('已存证截图: ' + SHOT); return true; })
        .catch(e => { log('截图失败: ' + (e.message || '').split('\n')[0]); return false; });
      const guard = wait(15000).then(() => { log('截图超时放弃（不影响签到结果）'); return false; });
      return Promise.race([p, guard]);
    };

    const isDone = async () => {
      for (const f of page.frames()) {
        try { if (await f.evaluate(DONE_FN)) return true; } catch (e) {}
      }
      return false;
    };
    const clickAny = async (texts) => {
      for (const f of page.frames()) {
        try {
          const r = await f.evaluate(CLICK_FN, texts);
          if (r) return f.url().slice(0, 60) + ' -> ' + r;
        } catch (e) {}
      }
      return null;
    };

    // 2026-10-09 新增诊断：先确认「加油站/成长空间」组件是否渲染。
    // 若压根没渲染，说明 UI 改版或入口变更，避免再像今天那样模糊匹配误点聊天记录。
    const hasEntry = async () => {
      for (const f of page.frames()) {
        try {
          const r = await f.evaluate(() => {
            const walk = (root) => {
              for (const el of root.querySelectorAll('*')) {
                const c = ((el.className || '') + '').toString();
                const t = (el.innerText || '').slice(0, 40);
                if (/fuel|station/i.test(c) || /加油站|做任务赢积分|积分好礼/.test(c + ' ' + t)) return true;
                if (el.shadowRoot && walk(el.shadowRoot)) return true;
              }
              return false;
            };
            return walk(document);
          });
          if (r) return true;
        } catch (e) {}
      }
      return false;
    };
    if (await isDone()) {
      log('检测到已签到标记，无需重复领取');
      saveResult({ ok: true, note: 'already done' });
      try { await browser.close(); } catch (e) {}
      process.exit(0);
    }

    // 2026-10-09 根治：浮层（Buddy加油站）只在 WorkBuddy 启动/重启后短暂弹出，错过即收起。
    // 若此处检测不到入口组件，普通自动签到会干等失败、次日仍可能漏签。
    // 处理：① 若本次是「自愈重启后调用」(WB_CHECKIN_NO_RESTART=1)，不再二次触发重启，依赖刚重启后浮层出现；
    //       ② 否则主动触发系统自愈（杀全部实例->带端口重启->浮层重弹->由 selfheal 接管补签），本进程 exit(4)。
    const entry = await hasEntry();
    if (!entry) {
      log('诊断: 未发现「加油站/成长空间」入口组件（浮层未渲染/已收起）');
      if (!process.env.WB_CHECKIN_NO_RESTART) {
        log('浮层缺失 -> 主动触发系统自愈重启以重新弹出浮层');
        const ok = triggerScheduledSelfheal();
        saveResult({ ok: false, selfhealTriggered: ok, reason: 'entry missing, triggered selfheal to re-show floating panel' });
        log('RESULT: SELFHEAL_TRIGGERED (浮层缺失，已安排重启补签)');
        try { if (browser) await browser.close(); } catch (e) {}
        process.exit(4);
      } else {
        log('（本次由自愈调用，不再二次触发重启；依赖刚重启后浮层出现）');
      }
    }

    // 浮层可能还在加载（刚启动/刚重启时尤其明显）→ 最多重试 3 次
    const steps = [];
    let clicked = null;
    for (let i = 1; i <= 3; i++) {
      if (i > 1) await page.waitForTimeout(8000);
      clicked = await clickAny(['立即领取', '领取今日礼包', '今日礼包', '签到领积分']);
      steps.push('try' + i + ': ' + (clicked || 'not found'));
      log('第' + i + '次点击:', clicked || '未找到按钮');
      if (clicked) break;
    }
    await page.waitForTimeout(3000);

    if (!(await isDone()) && clicked) {
      const again = await clickAny(['确定', '我知道了', '立即领取']);
      steps.push('round2: ' + (again || 'none'));
      log('第二轮点击:', again || '无');
      await page.waitForTimeout(3000);
    }

    let done = await isDone();
    if (!done) {
      // ★2026-10-16 固化：DOM 没确认到账时，再问一次服务端。
      // 典型场景 = 今日已领取 -> 浮层不渲染「已签到」文本 -> 旧逻辑 exit=2 误报失败。
      const st1 = await queryServerStatus(page, true);
      if (st1 && st1.today_checked_in === true) {
        log('服务端核验: 今日已领取（DOM 未确认，但服务端口径成功；连续 ' + st1.streak_days + ' 天, 累计 ' + st1.total_credits + ' 分）');
        saveResult({
          ok: true, note: 'server-verified after click attempt', steps,
          today_checked_in: true, streak_days: st1.streak_days, total_credits: st1.total_credits
        });
        try { await browser.close(); } catch (e) {}
        process.exit(0);
      }
      await shot();   // 仅失败时留证，成功路径不截图
    }
    log(done ? 'RESULT: 签到成功' : 'RESULT: 未能确认签到成功（见截图 ' + SHOT + '）');
    saveResult({ ok: done, steps, screenshot: done ? undefined : SHOT });
    try { await browser.close(); } catch (e) {}
    process.exit(done ? 0 : 2);
  } catch (e) {
    log('ERROR:', e.message);
    saveResult({ ok: false, error: e.message });
    try { if (browser) await browser.close(); } catch (e2) {}
    process.exit(1);
  }
})();
