const { chromium } = require('C:\\Users\\chenjialin3\\.workbuddy\\binaries\\node\\workspace\\node_modules\\playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const TARGET_SN = process.argv[2] || 'REQ20261056168';
const OUT = 'E:\\workbuddy\\Claw\\reports\\bpm_probe';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('dialog', async d => { try { await d.dismiss(); } catch {} });

  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(14000);

  const t = await page.evaluate(async (sn) => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
    const txt = await r.text();
    const list = (JSON.parse(txt.replace(/new Date\(([^)]+)\)/g, '"date"')).children || []);
    const hit = list.find(x => x.SerialNum === sn);
    return hit ? { TaskID: hit.TaskID, StepID: hit.StepID, Desc: hit.Description } : null;
  }, TARGET_SN);
  console.log('命中:', JSON.stringify(t));
  if (!t) { await browser.close(); return process.exit(1); }

  const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${t.TaskID}&StepID=${t.StepID}&pid=${t.StepID}&state=running`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // 等表单 iframe 就绪
  for (let i = 0; i < 30; i++) {
    await wait(5000);
    const st = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('iframe').forEach(f => {
        try {
          const d = f.contentDocument;
          if (!d) return;
          out.push({ rs: d.readyState, len: (d.body ? d.body.innerText.length : 0), hasInput: d.querySelectorAll('input').length });
        } catch (e) {}
      });
      return out;
    });
    console.log('t+' + ((i + 1) * 5) + 's', JSON.stringify(st));
    if (st.some(x => x.rs === 'interactive' && x.hasInput > 5)) break;
  }
  await wait(4000);
  await page.screenshot({ path: OUT + '\\approve_page.png' });

  // 扫描所有 frame 里像按钮的文字
  const dump = await page.evaluate(() => {
    const res = [];
    const scan = (doc, tag) => {
      try {
        doc.querySelectorAll('a,button,span,div,td,input[type=button]').forEach(el => {
          const txt = (el.tagName === 'INPUT' ? el.value : el.innerText || '').trim();
          if (!txt || txt.length > 12) return;
          if (!/同意|通过|批准|确定|提交|拒绝|驳回|审批|签核|下一步/.test(txt)) return;
          const r = el.getBoundingClientRect();
          res.push({ f: tag, text: txt, tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: r.width > 0 && r.height > 0 });
        });
      } catch (e) {}
    };
    scan(document, 'top');
    document.querySelectorAll('iframe').forEach((f, i) => { try { if (f.contentDocument) scan(f.contentDocument, 'iframe' + i); } catch (e) {} });
    return res;
  });
  console.log('=== 按钮候选 ===');
  console.log(JSON.stringify(dump, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
