// 调度 selfheal.js 在 delayMin 分钟后执行（脱离本进程树，避免自杀）。
// 用途：当前 WorkBuddy 可见窗口无调试端口、端口被僵尸实例占用，需重启并补签。
const { spawnSync } = require('child_process');
const path = require('path');
const DIR = __dirname;
const delayMin = parseInt(process.argv[2] || '2', 10);

const t = new Date(Date.now() + delayMin * 60 * 1000);
const hh = String(t.getHours()).padStart(2, '0');
const mm = String(t.getMinutes()).padStart(2, '0');
const selfheal = path.join(DIR, 'selfheal.js');
const tr = '"' + process.execPath + '" "' + selfheal + '"';
const r = spawnSync('schtasks', [
  '/create', '/tn', 'WB_Checkin_Selfheal',
  '/tr', tr, '/sc', 'once', '/st', hh + ':' + mm, '/f'
], { encoding: 'utf8', windowsHide: true });
const out = ((r.stdout || '') + (r.stderr || '')).trim();
console.log('schtasks rc=' + r.status + ' time=' + hh + ':' + mm);
console.log(out.replace(/\s+/g, ' ').slice(0, 400));
process.exit(r.status === 0 ? 0 : 1);
