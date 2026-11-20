// 只读：探查帆软登录页真实输入控件与登录按钮结构
const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION = 'E:\\workbuddy\\Claw\\.workbuddy\\finereport_session.json';
const LOGIN = 'http://10.1.232.246:8089/webroot/decision/login';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--auth-server-allowlist=10.1.232.246', '--auth-negotiate-delegate-allowlist=10.1.232.246'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'zh-CN', ignoreHTTPSErrors: true });
    if (fs.existsSync(SESSION)) {
      const s = JSON.parse(fs.readFileSync(SESSION, 'utf8').replace(/^\uFEFF/, ''));
      await ctx.addCookies((s.cookies || []).map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/' })));
    }
    const page = await ctx.newPage();
    await page.goto(LOGIN, { waitUntil: 'commit', timeout: 40000 });
    await wait(12000);
    const info = await page.evaluate(() => {
      const out = { allInputs: [], editable: [], shadow: [], loginBtns: [], suspicious: [], frames: [] };
      out.allInputs = [...document.querySelectorAll('input,textarea,select')].map(e => e.outerHTML.slice(0, 220));
      out.editable = [...document.querySelectorAll('[contenteditable],[placeholder],[role=textbox]')].map(e => e.outerHTML.slice(0, 220)).slice(0, 20);
      for (const e of document.querySelectorAll('*')) {
        if (e.shadowRoot) out.shadow.push({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 60), html: e.shadowRoot.innerHTML.slice(0, 400) });
      }
      for (const e of document.querySelectorAll('*')) {
        const t = (e.childElementCount === 0 ? (e.innerText || e.value || '') : '').trim();
        if (t === '登录') out.loginBtns.push(e.outerHTML.slice(0, 240));
      }
      for (const e of document.querySelectorAll('div,span,li,label')) {
        const k = ((e.className || '').toString() + ' ' + (e.id || '')).toLowerCase();
        if (/user|pass|login|input|account|name/.test(k) && e.getBoundingClientRect().width > 0) {
          out.suspicious.push(e.outerHTML.slice(0, 200));
        }
      }
      out.suspicious = out.suspicious.slice(0, 25);
      out.frames = [...document.querySelectorAll('iframe,frame')].map(f => f.src);
      return out;
    });
    console.log('=== body.innerHTML 前 5000 字 ===');
    console.log(await page.evaluate(() => document.body.innerHTML.slice(0, 5000)));
    console.log('=== 原生 input/textarea/select (' + info.allInputs.length + ') ===');
    info.allInputs.forEach(x => console.log('  ', x));
    console.log('=== 可编辑/placeholder (' + info.editable.length + ') ===');
    info.editable.forEach(x => console.log('  ', x));
    console.log('=== shadow root (' + info.shadow.length + ') ===');
    info.shadow.forEach(x => console.log('  ', JSON.stringify(x).slice(0, 500)));
    console.log('=== 文字为「登录」的元素 (' + info.loginBtns.length + ') ===');
    info.loginBtns.forEach(x => console.log('  ', x));
    console.log('=== 疑似控件 class (' + info.suspicious.length + ') ===');
    info.suspicious.forEach(x => console.log('  ', x));
    console.log('=== iframe ===', info.frames);
  } finally { await browser.close().catch(() => {}); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
