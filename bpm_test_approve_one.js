const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(msg); }
const SN = 'REQ202608300118';

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox','--auth-server-allowlist=bpm.timesgroup.cn','--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const page = await (await b.newContext({ viewport:{width:1920,height:1080}, ignoreHTTPSErrors:true })).newPage();
  log('登录...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(12000);

  log('双击打开: ' + SN);
  await page.locator('tr:has-text("' + SN + '")').first().dblclick();
  await wait(10000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/before_approve.png', fullPage:false });
  log('截图: reports/before_approve.png');

  // 点击同意
  log('点击 同意');
  try {
    await page.click('text=同意');
    log('  点击成功');
  } catch(e) {
    log('  点击失败: ' + e.message);
  }
  await wait(3000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/after_approve_click.png', fullPage:false });
  log('截图: reports/after_approve_click.png');

  // 处理可能的确认弹窗（填意见+点确定）
  for (let round=0; round<3; round++) {
    const res = await page.evaluate(() => {
      // 填 textarea
      for (const ta of document.querySelectorAll('textarea')) {
        if (!ta.value) { ta.value='同意'; ta.dispatchEvent(new Event('input',{bubbles:true})); ta.dispatchEvent(new Event('change',{bubbles:true})); }
      }
      // 点击确定/是/提交/确认
      for (const text of ['确定','是','确认','提交','OK']) {
        for (const el of document.querySelectorAll('button,a,span,input,.x-btn,.x-btn-inner')) {
          const t = (el.textContent||el.value||'').trim();
          if (t===text && el.offsetParent!==null) { el.click(); return {clicked:text}; }
        }
      }
      return {clicked:null};
    });
    if (!res.clicked) break;
    log('  点击了 ' + res.clicked);
    await wait(3000);
  }

  await wait(5000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/after_approve.png', fullPage:false });
  log('截图: reports/after_approve.png');

  const info = await page.evaluate(() => ({ url: location.href, body: document.body.innerText.substring(0,500) }));
  log('当前URL: ' + info.url);
  log('页面文本: ' + info.body);

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
