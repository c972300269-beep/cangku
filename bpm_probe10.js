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
  await wait(15000);

  // 方法A: 单击 text=SN
  log('方法A: click text=SN');
  await page.click(`text=${SN}`);
  await wait(15000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_click_open.png', fullPage:false });
  let info = await page.evaluate(() => {
    const hasDisagree = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意');
    return { url: location.href, hasDisagree, iframes: document.querySelectorAll('iframe').length };
  });
  log('  ' + JSON.stringify(info));

  // 方法B: 单击 .x-grid-row
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(10000);
  log('方法B: click .x-grid-row:has-text(SN)');
  await page.locator('.x-grid-row:has-text("' + SN + '")').first().click();
  await wait(10000);
  info = await page.evaluate(() => {
    const hasDisagree = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意');
    const selected = document.querySelectorAll('.x-grid-row-selected, .x-grid-item-selected').length;
    return { url: location.href, hasDisagree, selected, iframes: document.querySelectorAll('iframe').length };
  });
  log('  ' + JSON.stringify(info));

  // 方法C: 测试批量同意按钮
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 }); await wait(10000);
  log('方法C: 批量同意流程');
  // 先 ctrl+click 选中多行
  const sns = ['REQ202608300118','REQ202608300107','REQ202608300099'];
  for (let i=0;i<sns.length;i++) {
    const s = sns[i];
    const row = page.locator('.x-grid-row:has-text("' + s + '")').first();
    if (await row.count()) {
      if (i===0) await row.click();
      else await row.click({ modifiers: ['Control'] });
      await wait(500);
    }
  }
  await wait(1000);
  const selBefore = await page.evaluate(() => document.querySelectorAll('.x-grid-row-selected, .x-grid-item-selected').length);
  log('  选中行数: ' + selBefore);
  // 点批量同意
  await page.click('text=批量同意').catch(e => log('  点击批量同意失败: ' + e.message));
  await wait(5000);
  await page.screenshot({ path: 'E:/workbuddy/Claw/reports/probe_bulk_click.png', fullPage:false });
  const after = await page.evaluate(() => {
    const hasConfirm = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => ['确定','是','确认','提交'].includes((el.textContent||'').trim()));
    return { url: location.href, body: document.body.innerText.substring(0,200), hasConfirm };
  });
  log('  ' + JSON.stringify(after));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
