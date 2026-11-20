// 以 detached 方式启动 checkin_now.js，使其脱离 WorkBuddy 进程树独立存活。
// 之后 checkin_now 会杀掉宿主 WorkBuddy 并带端口重启 + 自动签到。
const { spawn } = require('child_process');
const path = require('path');
const DIR = __dirname;
const node = process.execPath;
const env = Object.assign({}, process.env, {
  NODE_PATH: 'C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules'
});
const p = spawn(node, [path.join(DIR, 'checkin_now.js'), '5000'], {
  detached: true, stdio: 'ignore', env, windowsHide: true
});
p.unref();
console.log('launched checkin_now pid=' + p.pid);
process.exit(0);
