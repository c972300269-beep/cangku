// 通过 Server酱 (ServerChan) 把消息推送到个人微信（方糖公众号）
// 用法: node push_to_wechat.js "<标题>" < 正文文件
// SendKey 从 环境变量 SERVERCHAN_SENDKEY 或 同目录 serverchan_key.txt 读取（不硬编码、不打印）
const https = require('https');
const fs = require('fs');

const KEY_FILE = 'E:/workbuddy/Claw/.workbuddy/scripts/serverchan_key.txt';

function getKey() {
  if (process.env.SERVERCHAN_SENDKEY) return process.env.SERVERCHAN_SENDKEY.trim();
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch (e) { return ''; }
}

function post(key, title, desp) {
  let url;
  if (key.startsWith('sctp')) {
    const m = key.match(/^sctp(\d+)t/);
    const uid = m ? m[1] : '';
    url = `https://${uid}.push.ft07.com/send/${key}.send`;
  } else {
    url = `https://sctapi.ftqq.com/${key}.send`;
  }
  const body = new URLSearchParams({ title, desp }).toString();
  const data = Buffer.from(body);
  const u = new URL(url);
  const opts = {
    method: 'POST',
    hostname: u.hostname,
    path: u.pathname + u.search,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': data.length,
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let chunk = '';
      res.on('data', (d) => (chunk += d));
      res.on('end', () => {
        try { resolve(JSON.parse(chunk)); } catch (e) { resolve({ raw: chunk }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const key = getKey();
  if (!key) {
    console.error('NO_SENDKEY: 未配置 Server酱 SendKey。请把 SendKey 写入 ' + KEY_FILE + ' 或设置环境变量 SERVERCHAN_SENDKEY');
    process.exit(2);
  }
  const title = (process.argv[2] || 'WorkBuddy 通知').replace(/\r?\n/g, ' ');
  let desp = '';
  if (process.argv[3]) desp = process.argv[3];
  else { try { desp = fs.readFileSync(0, 'utf8'); } catch (e) { desp = ''; } }

  try {
    const r = await post(key, title, desp);
    if (r && r.code === 0) { console.log('PUSH_OK'); process.exit(0); }
    console.error('PUSH_FAIL: ' + JSON.stringify(r));
    process.exit(1);
  } catch (e) {
    console.error('PUSH_ERROR: ' + e.message);
    process.exit(1);
  }
})();
