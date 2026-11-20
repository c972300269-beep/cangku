const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg){ console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(() => {}); } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

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

  let allTasks = await page.evaluate(async () => {
    const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
    const t = await r.text();
    const c = t.replace(/new Date\(([^)]+)\)/g,'"date"');
    return (JSON.parse(c).children||[]).map(x=>({SN:x.SerialNum, StepID:String(x.StepID), TaskID:String(x.TaskID), Desc:x.Description, Owner:x.OwnerDisplayName, State:(x.State&&x.State.State)||'running', Title:x.TaskTitle||x.ProcessName||''}));
  });
  // 关键词过滤：node bpm_approve_all_v3.js 调班   （不传则审批全部待办）
  const KW = (process.argv[2] || '').trim();
  const tasks = KW ? allTasks.filter(t => (t.Desc||'').includes(KW) || (t.Title||'').includes(KW)) : allTasks;
  log(`待办总数: ${allTasks.length}条${KW?`，匹配「${KW}」: ${tasks.length}条`:''}`);
  allTasks.forEach((t,i)=>log(`  ${tasks.includes(t)?'★':'  '} ${i+1}. [${t.SN}] ${t.Desc} (${t.Owner})`));
  if (tasks.length === 0) { log('没有符合条件的待办，退出'); await safeClose(b); return; }

  const results = [];

  for (const task of tasks) {
    log(`\n${'='.repeat(40)}`);
    log(`审批: ${task.SN}`);
    let ok = false;

    for (let attempt=1; attempt<=2; attempt++) {
      const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}&state=${task.State}`;
      log(`  尝试 ${attempt}: 打开 ${url}`);
      try {
        await page.goto(url, { waitUntil:'domcontentloaded', timeout:30000 });
      } catch(e) {
        log('  goto 失败: ' + e.message);
        continue;
      }
      await wait(12000);

      // 检查是否加载了审批按钮
      const state = await page.evaluate(() => {
        const hasAgree = [...document.querySelectorAll('button,a,span,.x-btn,.x-btn-inner')].some(el => (el.textContent||'').trim()==='同意');
        return { url: location.href, hasAgree, iframes: document.querySelectorAll('iframe').length };
      });
      log(`  加载状态: hasAgree=${state.hasAgree} iframes=${state.iframes}`);
      if (!state.hasAgree) { continue; }

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

      // 处理确认/意见弹窗
      for (let round=0; round<2; round++) {
        const res = await page.evaluate(() => {
          // 填 textarea
          for (const ta of document.querySelectorAll('textarea')) {
            if (!ta.value) { ta.value='同意'; ta.dispatchEvent(new Event('input',{bubbles:true})); ta.dispatchEvent(new Event('change',{bubbles:true})); }
          }
          // 点确定/是/提交/确认
          for (const text of ['确定','是','确认','提交','OK']) {
            for (const el of document.querySelectorAll('button,a,span,input,.x-btn,.x-btn-inner')) {
              const t = (el.textContent||el.value||'').trim();
              if (t===text && el.offsetParent!==null) { el.click(); return { clicked: text }; }
            }
          }
          return { clicked: null };
        });
        log(`    弹窗轮 ${round+1}: clicked=${res.clicked}`);
        if (!res.clicked) break;
        await wait(5000);
      }

      await wait(5000);
      await page.screenshot({ path: `E:/workbuddy/Claw/reports/approve_${task.SN}_done.png`, fullPage:false });

      // 验证该条是否还在待办
      const after = await page.evaluate(async (sn) => {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc='+Date.now(),{credentials:'include'});
        const t = await r.text();
        return { stillThere: t.includes(sn) };
      }, task.SN);
      log(`  验证: 仍在待办=${after.stillThere}`);
      ok = !after.stillThere;
      if (ok) break;
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

  require('fs').writeFileSync(
    'E:\\workbuddy\\Claw\\.workbuddy\\bpm_output\\approve_result.json',
    JSON.stringify({ time: new Date().toISOString(), results, finalCount: final.length, final }, null, 2),
    'utf8'
  );
  log('完成');
  await safeClose(b);
})().catch(async e=>{
  console.error(e);
  process.exit(1);
});
