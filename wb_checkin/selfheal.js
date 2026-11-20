/**
 * WorkBuddy 签到自愈器：以调试端口重启 WorkBuddy，然后自动执行签到。
 *
 * 触发场景：WorkBuddy 正在运行但没有带 --remote-debugging-port=9222 启动，
 *           导致 checkin.js 无法通过 CDP 连接。Electron 的调试端口只能在启动时开启，
 *           运行中无法打开，因此必须重启一次应用（重启后写进启动项，之后永久生效）。
 *
 * 本脚本应由 Windows 计划任务（脱离 WorkBuddy 进程树）调用，避免自杀。
 *
 * 流程：1) 温和退出 WorkBuddy（必要时强杀） -> 2) 带调试端口重新启动
 *      -> 3) 等待 9222 就绪 -> 4) 调用 checkin.js 完成签到
 *
 * 运行：node selfheal.js
 */
const { execSync, spawn, spawnSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const LOG = path.join(DIR, 'restart.log');
const WB_EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\Programs\\WorkBuddy\\WorkBuddy.exe';
const NODE_PATH_DIR = 'C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules';
const USER_DIR = 'C:\\Users\\chenjialin3\\.workbuddy\\app';
const CHECKIN = path.join(DIR, 'checkin.js');

function log(s) {
  const line = '[' + new Date().toLocaleString('zh-CN') + '] ' + s;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch (e) {}
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function wbRunning() {
  try {
    const o = execSync('tasklist /FI "IMAGENAME eq WorkBuddy.exe" /NH', { encoding: 'utf8', windowsHide: true });
    return /WorkBuddy\.exe/i.test(o || '');
  } catch (e) { return false; }
}
function probePort() {
  return new Promise(res => {
    const s = net.connect(9222, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => { try { s.destroy(); } catch (e) {} res(false); });
    setTimeout(() => { try { s.destroy(); } catch (e) {} res(false); }, 800);
  });
}

// 2026-10-09 增强：仅 TCP 通不算 CDP 就绪。曾出现「端口被残留/僵尸 WorkBuddy 占住，
// TCP 通但 DevTools 的 /json/version HTTP 接口不响应」导致 checkin connectOverCDP 反复 30s 超时。
// 这里必须等 /json/version 真正返回且含 webSocketDebuggerUrl，才算 CDP 可用。
function httpGetJson(url) {
  return new Promise(res => {
    const http = require('http');
    const req = http.get(url, { timeout: 3000 }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(null); } });
    });
    req.on('timeout', () => { try { req.destroy(); } catch (e) {} res(null); });
    req.on('error', () => res(null));
  });
}
async function waitCdpHttpReady(maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const v = await httpGetJson('http://127.0.0.1:9222/json/version');
    if (v && v.webSocketDebuggerUrl) return true;
    await sleep(1500);
  }
  return false;
}

(async () => {
  log('===== selfheal start =====');

  // 1) 退出 WorkBuddy
  if (wbRunning()) {
    log('step1: graceful exit WorkBuddy');
    try { execSync('taskkill /IM WorkBuddy.exe', { stdio: 'ignore', windowsHide: true }); } catch (e) {}
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      if (!wbRunning()) break;
    }
    if (wbRunning()) {
      log('step1b: force kill');
      try { execSync('taskkill /F /IM WorkBuddy.exe', { stdio: 'ignore', windowsHide: true }); } catch (e) {}
      await sleep(5000);
    }
  }
  log('WorkBuddy stopped = ' + (!wbRunning()));

  // 2) 带调试端口启动（用正确的 user-data-dir，确保启动的是用户真实窗口而非空白实例）
  if (!fs.existsSync(WB_EXE)) { log('ABORT: WorkBuddy.exe not found at ' + WB_EXE); process.exit(1); }
  let httpReady = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    log('step2.' + attempt + ': 强杀残留 WorkBuddy 并以 --remote-debugging-port=9222 重启 (user-data-dir=' + USER_DIR + ')');
    try { execSync('taskkill /F /IM WorkBuddy.exe', { stdio: 'ignore', windowsHide: true }); } catch (e) {}
    await sleep(4000);
    const p = spawn(WB_EXE, ['--remote-debugging-port=9222', '--user-data-dir=' + USER_DIR], {
      detached: true, stdio: 'ignore', windowsHide: true
    });
    p.unref();

    // 3) 先等 TCP，再等 CDP HTTP (/json/version) 真正就绪
    let tcp = false;
    for (let i = 0; i < 30; i++) { await sleep(2000); if (await probePort()) { tcp = true; break; } }
    log('step3.' + attempt + ': TCP 9222 ready = ' + tcp);
    if (tcp) {
      const h = await waitCdpHttpReady(40000);
      log('step3.' + attempt + ': CDP HTTP (/json/version) ready = ' + h);
      if (h) { httpReady = true; break; }
    }
    log('step2.' + attempt + ': CDP 未就绪，准备重启动...');
  }
  if (!httpReady) { log('ABORT: CDP HTTP 始终未就绪'); process.exit(1); }

  // 给渲染进程和"Buddy加油站"浮层留出加载时间
  await sleep(15000);

  // 4) 签到（刚重启浮层渲染慢，失败则重试，最多 3 次）
  let lastStatus = -1;
  for (let attempt = 1; attempt <= 3; attempt++) {
    log('step4.' + attempt + ': run checkin.js');
  const r = spawnSync(process.execPath, [CHECKIN], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { NODE_PATH: NODE_PATH_DIR, WB_CHECKIN_NO_RESTART: '1' }),
    windowsHide: true
  });
    lastStatus = r.status;
    log('checkin exit=' + lastStatus);
    log(((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-10).join('\n'));
    if (lastStatus === 0 || lastStatus === 4) break;      // 0=成功 4=又安排了自愈（避免死循环）
    if (attempt < 3) { log('wait 45s before retry...'); await sleep(45000); }
  }
  // 5) 根治：禁用 D 盘那份重复的 WorkBuddy（空壳僵尸的来源，会抢占 9222 且无窗口）
  //    仅当 D:\WorkBuddy 存在且尚未被禁用时，重命名为 D:\WorkBuddy_DISABLED_<日期>（可逆，需恢复时改名回来）
  try {
    const dupDir = 'D:\\WorkBuddy';
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const disabledName = 'WorkBuddy_DISABLED_' + ymd;
    if (fs.existsSync(dupDir) && !fs.existsSync('D:\\' + disabledName)) {
      fs.renameSync(dupDir, 'D:\\' + disabledName);
      log('step5: disabled duplicate install -> D:\\' + disabledName);
    } else {
      log('step5: D:\\WorkBuddy 已禁用或不存在，跳过');
    }
  } catch (e) {
    log('step5: 无法禁用 D:\\WorkBuddy (可能仍被占用): ' + e.message);
  }

  log('===== selfheal done (exit=' + lastStatus + ') =====');
})().catch(e => {
  log('SELFHEAL ERROR: ' + e.message);
  process.exit(1);
});
