// 延迟执行 selfheal：先休眠 leadSec 秒（让 agent 先向用户报告），再以独立进程运行 selfheal.js
// selfheal 会：温和退出所有 WorkBuddy -> 带调试端口重启 -> 等待端口 -> 运行 checkin 完成签到
// 本脚本应由 launch_delayed_selfheal.js 以 detached 方式启动，确保宿主 WorkBuddy 被 kill 后仍能继续。
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LEAD_MS = parseInt(process.argv[2] || '90000', 10);
const DIR = __dirname;
const SELFHEAL = path.join(DIR, 'selfheal.js');

(async () => {
  await sleep(LEAD_MS);
  const node = process.execPath;
  const env = Object.assign({}, process.env, {
    NODE_PATH: 'C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules'
  });
  const p = spawn(node, [SELFHEAL], { detached: true, stdio: 'ignore', env, windowsHide: true });
  p.unref();
  // 写到 restart.log 便于事后核查
  const fs = require('fs');
  try { fs.appendFileSync(path.join(DIR, 'restart.log'),
    '[' + new Date().toLocaleString('zh-CN') + '] delayed_selfheal spawned selfheal pid=' + p.pid + '\n'); } catch (e) {}
  process.exit(0);
})();
