/**
 * 一键签到（自包含、脱离进程版）：
 *   1) 强杀所有 WorkBuddy 进程（含当前可见窗口与残留僵尸）
 *   2) 以 --remote-debugging-port=9222 重新拉起唯一实例（拿到单例锁+端口）
 *   3) 等端口就绪 + 等 UI 加载
 *   4) 运行 checkin.js 完成签到（最多重试 3 次）
 *   5) 结果写入 last_result.json 与 restart.log
 *
 * 用法：node checkin_now.js [leadMs]
 *   由 launch 包装器以 detached 方式启动，leadMs 让 agent 先向用户报告再执行。
 */
const { spawn, spawnSync, execSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const LOG = path.join(DIR, 'restart.log');
const MARKER = path.join(DIR, 'checkin_now_marker.txt');
const WB_EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\Programs\\WorkBuddy\\WorkBuddy.exe';
const NODE_PATH_DIR = 'C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules';
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
    s.on('connect', () => { try { s.destroy(); } catch (e) {} res(true); });
    s.on('error', () => { try { s.destroy(); } catch (e) {} res(false); });
    setTimeout(() => { try { s.destroy(); } catch (e) {} res(false); }, 800);
  });
}

(async () => {
  fs.writeFileSync(MARKER, 'started ' + new Date().toISOString() + '\n');
  const lead = parseInt(process.argv[2] || '5000', 10);
  await sleep(lead);
  fs.appendFileSync(MARKER, 'after lead, begin ' + new Date().toISOString() + '\n');
  log('===== checkin_now start =====');

  // 1) 杀掉全部 WorkBuddy
  let guard = 0;
  while (wbRunning() && guard < 30) {
    try { execSync('taskkill /F /IM WorkBuddy.exe', { stdio: 'ignore', windowsHide: true }); } catch (e) {}
    await sleep(1500);
    guard++;
  }
  log('all WorkBuddy stopped = ' + (!wbRunning()));
  if (wbRunning()) { log('ABORT: 无法结束 WorkBuddy'); process.exit(1); }

  // 2) 带端口拉起
  if (!fs.existsSync(WB_EXE)) { log('ABORT: WorkBuddy.exe 不存在'); process.exit(1); }
  const p = spawn(WB_EXE, ['--remote-debugging-port=9222'], { detached: true, stdio: 'ignore', windowsHide: true });
  p.unref();
  log('launched WorkBuddy with port, pid=' + p.pid);

  // 3) 等端口
  let ok = false;
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    if (await probePort()) { ok = true; break; }
  }
  log('port 9222 ready = ' + ok);
  if (!ok) { log('ABORT: 端口未起来'); process.exit(1); }

  // 给渲染进程 + Buddy加油站浮层加载时间
  await sleep(20000);

  // 4) 签到，最多 3 次
  let last = -1;
  for (let attempt = 1; attempt <= 3; attempt++) {
    log('checkin attempt ' + attempt);
    const r = spawnSync(process.execPath, [CHECKIN], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, { NODE_PATH: NODE_PATH_DIR }),
      windowsHide: true
    });
    last = r.status;
    log('checkin exit=' + last);
    log(((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-8).join(' | '));
    if (last === 0 || last === 4) break;
    if (attempt < 3) { await sleep(45000); }
  }
  log('===== checkin_now done (exit=' + last + ') =====');
  fs.appendFileSync(MARKER, 'done exit=' + last + ' ' + new Date().toISOString() + '\n');
  process.exit(0);
})().catch(e => {
  log('CHECKIN_NOW ERROR: ' + e.message);
  try { fs.appendFileSync(MARKER, 'error ' + e.message + '\n'); } catch (x) {}
  process.exit(1);
});
