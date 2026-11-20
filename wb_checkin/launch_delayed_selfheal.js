// 以 detached 方式启动 delayed_selfheal，使其脱离 WorkBuddy 进程树，
// 这样当 selfheal 稍后 kill 掉宿主 WorkBuddy 时，本脚本及其子进程仍能存活并完成重启+签到。
const { spawn } = require('child_process');
const path = require('path');
const DIR = __dirname;
const TARGET = path.join(DIR, 'delayed_selfheal.js');
const LEAD = process.argv[2] || '90000';

const node = process.execPath;
const env = Object.assign({}, process.env, {
  NODE_PATH: 'C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules'
});
const p = spawn(node, [TARGET, LEAD], { detached: true, stdio: 'ignore', env, windowsHide: true });
p.unref();
console.log('launched delayed_selfheal pid=' + p.pid + ' (lead=' + LEAD + 'ms)');
process.exit(0);
