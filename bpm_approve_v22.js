const { chromium } = require('playwright');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

async function safeClose(b) {
  if (!b) return;
  try { await b.close().catch(() => {}); } catch {}
  try { const p = b.process ? b.process() : null; if (p && p.pid) process.kill(p.pid, 'SIGKILL'); } catch {}
}

// 混合定位：evaluate 精确读取按钮文本 + elementHandle 原生点击（自动滚动/真实事件/自动处理 iframe 坐标）
// 解决旧版"坐标鼠标点击"对 iframe 嵌套表单（如加班申请）落空、误判失败的问题。
async function clickText(page, text, timeout = 25000) {
  const sels = ['a.x-btn', 'button', '.x-btn-inner'];
  for (const f of page.frames()) {
    for (const sel of sels) {
      try {
        const handles = await f.$$(sel);
        for (const h of handles) {
          const t = (await h.evaluate(el => (el.textContent || '').trim()).catch(() => '')) || '';
          if (t === text) {
            try {
              await h.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
              await h.click({ timeout });
              return true;
            } catch (e) { log('  clickText点击异常[' + text + ']: ' + e.message.slice(0, 80)); }
          }
        }
      } catch (e) {}
    }
  }
  return false;
}

async function hasText(page, text) {
  const sels = ['a.x-btn', 'button', '.x-btn-inner'];
  for (const f of page.frames()) {
    for (const sel of sels) {
      try {
        const handles = await f.$$(sel);
        for (const h of handles) {
          const t = (await h.evaluate(el => (el.textContent || '').trim()).catch(() => '')) || '';
          if (t === text) return true;
        }
      } catch (e) {}
    }
  }
  return false;
}

// 提交后「正在提交…」遮罩可能持续很久。不能立即跳转（会中断提交请求 → 误判失败）。
// 就地轮询待办列表确认 SN 消失；期间若出现弹窗二次确认则点击。
async function waitSubmit(page, sn, ms = 150000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let gone = false;
    try {
      gone = await page.evaluate(async (s) => {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
        return !(await r.text()).includes(s);
      }, sn);
    } catch (e) {}
    if (gone) return true;
    // 弹窗内的二次确认（确定/确认/是）
    try {
      for (const f of page.frames()) {
        const cb = f.locator('.x-window a.x-btn:has-text("确定"), .x-message-box a.x-btn:has-text("确定")');
        if (await cb.count()) { log('    弹窗二次确认...'); await cb.first().click({ timeout: 5000 }).catch(() => {}); await wait(3000); break; }
      }
    } catch (e) {}
    await wait(3000);
  }
  return false;
}

// 等表单 iframe 加载完成
async function waitFormReady(page, ms = 150000) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < ms) {
    const st = await page.evaluate(() => {
      const fr = [...document.querySelectorAll('iframe')].map(f => {
        let d = null; try { d = f.contentDocument; } catch (e) {}
        const body = d && d.body ? (d.body.innerText || '') : '';
        const rich = /流水号|审批|申请/.test(body);
        return { rs: d ? d.readyState : 'n/a', len: body.length, rich, hasInput: d ? d.querySelectorAll('input,textarea,table').length : 0 };
      });
      return fr;
    });
    const ok = st.some(f => (f.rs === 'complete' || f.rs === 'interactive') && f.rich && f.len > 60);
    const tag = JSON.stringify(st);
    if (tag !== last) { log('    form: ' + tag.slice(0, 150)); last = tag; }
    if (ok) return true;
    await wait(3000);
  }
  return false;
}

(async () => {
  const KW = (process.argv[2] || '').trim();
  const b = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  const results = [];
  let final = [];
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    log('登录 BPM...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    const all = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
      const j = JSON.parse((await r.text()).replace(/new Date\(([^)]+)\)/g, '"date"'));
      return (j.children || []).map(x => ({
        SN: x.SerialNum, StepID: String(x.StepID), TaskID: String(x.TaskID),
        Desc: x.Description, Owner: x.OwnerDisplayName,
        State: (x.State && x.State.State) || 'running', Title: x.TaskTitle || x.ProcessName || ''
      }));
    });
    // 关键词过滤（不传=全部）+ 安全排除盖章类（用户规则：盖章不自动审批）
    const matched = KW ? all.filter(t => ((t.Desc || '').includes(KW) || (t.Title || '').includes(KW))) : all;
    const tasks = matched.filter(t => !((t.Desc || '').includes('盖章') || (t.Title || '').includes('盖章')));
    log(`待办 ${all.length} 条${KW ? `，匹配「${KW}」${matched.length} 条` : ''}，排除盖章后 ${tasks.length} 条`);
    all.forEach((t, i) => log(`  ${tasks.includes(t) ? '★' : ' '} ${i + 1}. [${t.SN}] ${t.Desc} (${t.Owner})`));
    if (!tasks.length) { log('无匹配待办，退出'); await safeClose(b); return; }

    for (const task of tasks) {
      log(`\n=== ${task.SN} ${task.Desc} (${task.Owner}) ===`);
      let ok = false;
      let approved = false;
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Process.aspx?TaskID=${task.TaskID}&StepID=${task.StepID}&pid=${task.StepID}&state=${task.State}`;
        log(`  尝试${attempt} 打开表单`);
        try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }); }
        catch (e) { log('  goto失败 ' + e.message.slice(0, 70)); continue; }

        log('  等待表单加载...');
        const ready = await waitFormReady(page, 150000);
        log('  表单就绪=' + ready);
        if (!ready) { log('  ✗ 表单超时'); continue; }

        // 点「同意」（混合原生点击，支持 iframe 嵌套表单）
        log('  点击「同意」(原生跨frame)');
        const c1 = await clickText(page, '同意');
        log('  同意点击=' + c1);
        if (!c1) { log('  ✗ 找不到「同意」'); continue; }
        await wait(3000);

        // 等「确定」出现（内联审批意见面板）
        let found = false;
        for (let i = 0; i < 25; i++) {
          if (await hasText(page, '确定')) { log('  找到「确定」@' + (i * 2) + 's'); found = true; break; }
          await wait(2000);
        }
        if (!found) { log('  ✗ 「确定」未出现'); continue; }

        log('  点击「确定」提交');
        const c2 = await clickText(page, '确定');
        log('  确定点击=' + c2);

        // ★ 就地等待提交完成（不要在「正在提交…」时跳转，否则中断请求→误判失败）
        log('  等待提交完成（轮询待办）...');
        const submitted = await waitSubmit(page, task.SN, 150000);
        log('  提交完成=' + submitted);
        if (submitted) { ok = true; approved = true; }

        try { await page.screenshot({ path: `E:/workbuddy/Claw/reports/approve_${task.SN}_done.png`, timeout: 20000 }); } catch (e) {}

        if (!approved) {
          // 兜底：回首页复核一次
          await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await wait(8000);
          const after = await page.evaluate(async (sn) => {
            const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
            return { still: (await r.text()).includes(sn) };
          }, task.SN);
          ok = !after.still;
          log('  复核: 仍在待办=' + after.still + (ok ? '  ✅ 已通过' : '  ❌ 未通过'));
        } else {
          log('  ✅ 已通过');
        }
      }
      results.push({ SN: task.SN, Desc: task.Desc, Owner: task.Owner, ok });
    }

    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(8000);
    final = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&_dc=' + Date.now(), { credentials: 'include' });
      const j = JSON.parse((await r.text()).replace(/new Date\(([^)]+)\)/g, '"date"'));
      return (j.children || []).map(x => ({ SN: x.SerialNum, Desc: x.Description, Owner: x.OwnerDisplayName }));
    });
    log(`\n最终待办: ${final.length} 条`);
    final.forEach((t, i) => log(`  ${i + 1}. [${t.SN}] ${t.Desc} (${t.Owner})`));
    log('\n结果:');
    results.forEach(r => log(`  ${r.ok ? '✅' : '❌'} ${r.SN} ${r.Desc}`));

    fs.writeFileSync('E:\\workbuddy\\Claw\\.workbuddy\\bpm_output\\approve_result.json',
      JSON.stringify({ time: new Date().toISOString(), results, finalCount: final.length, final }, null, 2), 'utf8');
  } catch (e) {
    log('FATAL ' + e.message);
  } finally {
    await safeClose(b);
    log('完成');
  }
})();
