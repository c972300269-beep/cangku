const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox','--auth-server-allowlist=bpm.timesgroup.cn','--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const page = await (await b.newContext({ viewport:{width:1920,height:1080}, ignoreHTTPSErrors:true })).newPage();

  log('登录 BPM...');
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(12000);

  // 获取待办
  const tasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({TaskID:x.TaskID, StepID:x.StepID, SN:x.SerialNum, Desc:x.Description, Owner:x.OwnerDisplayName}));
  });
  log(`待办: ${tasks.length}条`);
  tasks.forEach((t,i)=>log(`  ${i+1}. [${t.SN}] ${t.Desc} (${t.Owner})`));

  const results = [];

  for (const task of tasks) {
    log(`\n${'='.repeat(40)}`);
    log(`开始审批: ${task.SN}`);
    let ok = false;
    for (let attempt=1; attempt<=3; attempt++) {
      // 确保在首页
      await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 });
      await wait(8000);

      log(`  尝试 ${attempt}: 双击 ${task.SN}`);
      try {
        await page.dblclick('text=' + task.SN);
      } catch(e) {
        log('  双击出错: ' + e.message);
        continue;
      }
      await wait(12000);
      await page.screenshot({ path: `E:/workbuddy/Claw/reports/approve_${task.SN}_open.png`, fullPage:false });

      // 检查是否打开审批页
      const state = await page.evaluate(() => {
        const hasDisagree = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='不同意');
        const iframes = [...document.querySelectorAll('iframe')].map(f => f.src);
        const url = location.href;
        return { hasDisagree, iframes, url, title: document.title };
      });
      log(`  打开后: hasDisagree=${state.hasDisagree} url=${state.url} iframes=${state.iframes.length}`);

      if (!state.hasDisagree) {
        log('  未打开审批页，重试');
        continue;
      }

      // 点击同意
      log('  点击 同意');
      try {
        await page.click('text=同意');
        log('  点击成功');
      } catch(e) {
        log('  点击同意失败: ' + e.message);
        continue;
      }
      await wait(3000);
      await page.screenshot({ path: `E:/workbuddy/Claw/reports/approve_${task.SN}_click.png`, fullPage:false });

      // 处理确认弹窗/意见框
      let round=0;
      while (round < 4) {
        const res = await page.evaluate(() => {
          let clicked=null;
          for (const ta of document.querySelectorAll('textarea')) {
            if (!ta.value) { ta.value='同意'; ta.dispatchEvent(new Event('input',{bubbles:true})); ta.dispatchEvent(new Event('change',{bubbles:true})); }
          }
          for (const text of ['确定','是','确认','提交','OK']) {
            for (const el of document.querySelectorAll('button,a,span,input,.x-btn,.x-btn-inner')) {
              const t = (el.textContent||el.value||'').trim();
              if (t===text && el.offsetParent!==null) { el.click(); clicked=text; break; }
            }
            if (clicked) break;
          }
          return { clicked, url: location.href, body: document.body.innerText.substring(0,80) };
        });
        log(`    弹窗轮 ${round+1}: clicked=${res.clicked} url=${res.url}`);
        if (!res.clicked) break;
        await wait(3000);
        round++;
      }

      await wait(5000);
      await page.screenshot({ path: `E:/workbuddy/Claw/reports/approve_${task.SN}_done.png`, fullPage:false });

      // 判断结果：看是否回到首页且该条消失
      const after = await page.evaluate(async (sn) => {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
        return { stillThere: r.text().includes(sn), url: location.href };
      }, task.SN);
      log(`  结果: 仍在待办=${after.stillThere} url=${after.url}`);
      ok = !after.stillThere;
      break;
    }
    results.push({ SN: task.SN, Desc: task.Desc, ok });
    log(`  ${ok?'✅ 成功':'❌ 失败'}: ${task.SN}`);
  }

  // 最终查询
  await page.goto('http://bpm.timesgroup.cn', { waitUntil:'domcontentloaded', timeout:30000 });
  await wait(8000);
  const final = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({SN:x.SerialNum, Desc:x.Description, Owner:x.OwnerDisplayName}));
  });
  log(`\n最终待办: ${final.length}条`);
  final.forEach((t,i)=>log(`  ${i+1}. [${t.SN}] ${t.Desc} (${t.Owner})`));

  log('\n本次审批结果:');
  results.forEach(r => log(`  ${r.ok?'✅':'❌'} ${r.SN} ${r.Desc}`));

  await b.close();
  log('完成');
})().catch(e=>{ console.error(e); process.exit(1); });
