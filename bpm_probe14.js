const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(msg); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox','--auth-server-allowlist=bpm.timesgroup.cn','--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const page = await (await b.newContext({ viewport:{width:1920,height:1080}, ignoreHTTPSErrors:true })).newPage();
  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(15000);

  const findings = await page.evaluate(() => {
    const res = { scripts: [], globals: [] };
    const keywords = ['CompleteTask','SubmitTask','Approve','Agree','同意','PostBack','Task.ashx','Form.ashx','Workflow.ashx','Execute'];
    document.querySelectorAll('script[src]').forEach(s => {
      const src = s.getAttribute('src') || '';
      if (src.includes('.js')) res.scripts.push(src);
    });
    // 检查 window 上的全局对象
    for (const k of ['YZSoft','BPM','YZSoftBPM','App','Application','Ext','YZ','openTask','OpenTask']) {
      if (window[k] !== undefined) res.globals.push(k + ':' + typeof window[k]);
    }
    return res;
  });
  log('JS scripts:');
  findings.scripts.slice(0,30).forEach(s => log('  ' + s));
  log('Globals:');
  findings.globals.forEach(g => log('  ' + g));

  // 抓取主要 JS 文件搜索关键词
  const scripts = findings.scripts.filter(s => s.includes('YZSoft') || s.includes('BPM') || s.includes('app') || s.includes('workflow') || s.includes('task'));
  log('\n抓取 ' + scripts.length + ' 个脚本搜索关键词...');
  for (const src of scripts.slice(0,20)) {
    try {
      const url = src.startsWith('http') ? src : (src.startsWith('/') ? 'http://bpm.timesgroup.cn' + src : 'http://bpm.timesgroup.cn/' + src);
      const resp = await page.evaluate(async (url) => {
        try { const r = await fetch(url); return { ok: r.ok, text: await r.text() }; } catch(e){ return { ok:false, text: e.message }; }
      }, url);
      if (resp.ok) {
        const text = resp.text;
        const hits = [];
        for (const kw of ['CompleteTask','SubmitTask','Approve','同意','Form.ashx','Task.ashx','method=','execute']) {
          if (text.includes(kw)) hits.push(kw);
        }
        if (hits.length) log(`  ${url}: ${hits.join(',')}`);
      }
    } catch(e){}
  }

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
