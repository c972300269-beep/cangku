// bpm_fetch_amounts.js — 抓取"我发起的·审批中"请款流程的请款金额，存缓存
// 用法: node bpm_fetch_amounts.js
// 逻辑: 标题带金额的直接入库；其余且缓存没有的，逐条打开表单提取金额（只跑新增/缺失的）
// 缓存: .workbuddy/bpm_output/qingkuan_amounts.json  { SN: {amount, label, source, desc, fetched_at} }
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

const CACHE = path.join(__dirname, '..', 'bpm_output', 'qingkuan_amounts.json');
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';

async function safeClose(b) {
  if (!b) return;
  try { await b.close().catch(() => {}); } catch {}
  try { const p = b.process ? b.process() : null; if (p && p.pid) process.kill(p.pid, 'SIGKILL'); } catch {}
}

// 与 gen_bpm_brief.py 一致的标题金额正则（优先级同序）
const TITLE_PATS = [
  /[（(](?:智通|同国)[：:]?\s*([\d,，.]+)/,
  /金额[：:]?\s*([\d,，.]+)/,
  /[¥￥]\s*([\d,，.]+)/,
  /([\d,，]+\.\d+)\s*元/,
  /([\d,，]+)\s*元/,
];
function titleAmount(desc) {
  const s = String(desc || '');
  for (const p of TITLE_PATS) {
    const m = s.match(p);
    if (m) {
      const v = parseFloat(m[1].replace(/，/g, ',').replace(/,/g, ''));
      if (!isNaN(v)) return v;
    }
  }
  return null;
}

// 表单内提金额：优先结构化（表格 label 行/值行配对），回退纯文本正则
const LABEL_PRIO = ['此次请款金额', '本次请款金额', '本次付款金额', '申请金额', '请款金额', '付款金额', '费用金额', '报销金额', '支付金额'];
const AMT_RE = /^[¥￥]?\s*[\d,，]+(?:\.\d+)?$/;
// 纯文本回退：按 label 优先级匹配「标签 + 金额」，捕获组 1 = 金额（formAmount 用）
const LABEL_PATS = LABEL_PRIO.map(l => new RegExp(l + '[^0-9]{0,10}[¥￥]?\\s*([\\d,，]+(?:\\.\\d+)?)'));
function toNum(s) {
  const v = parseFloat(String(s || '').replace(/[¥￥,，\s]/g, ''));
  return isNaN(v) ? null : v;
}

// 结构化解析：rows = 每行单元格数组（值单元格以 [V] 前缀标记）
function formAmountStructured(rows) {
  for (const label of LABEL_PRIO) {
    const cands = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = rows[ri];
      const li = cells.findIndex(c => c === label || (c.startsWith(label) && c.length <= label.length + 2));
      if (li < 0) continue;
      // 同行取值（[V]标记）
      for (let j = li + 1; j < cells.length; j++) {
        const c = cells[j];
        if (c.startsWith('[V]') && AMT_RE.test(c.slice(3))) { const v = toNum(c.slice(3)); if (v > 0) cands.push({ v, ev: `${label}=[${c.slice(3)}]@行${ri + 1}` }); break; }
      }
      // 值在下一行同列
      if (!cands.length || ri + 1 < rows.length) {
        const nxt = rows[ri + 1] || [];
        const c = nxt[li];
        if (c && c.startsWith('[V]') && AMT_RE.test(c.slice(3))) { const v = toNum(c.slice(3)); if (v > 0) cands.push({ v, ev: `${label}=下一行[${c.slice(3)}]@行${ri + 1}` }); }
      }
    }
    if (cands.length) {
      const cnt = {};
      for (const c of cands) cnt[c.v] = (cnt[c.v] || 0) + 1;
      const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      return { amount: parseFloat(best[0]), source: 'struct', ev: cands[0].ev };
    }
  }
  return null;
}

function formAmount(fullText) {
  const s = String(fullText || '').replace(/\s+/g, ' ');
  const cands = [];
  for (const p of LABEL_PATS) {
    const re = new RegExp(p.source, 'g');
    let m;
    while ((m = re.exec(s)) !== null) {
      const v = parseFloat(m[1].replace(/[,，]/g, ''));
      if (!isNaN(v) && v > 0) cands.push({ v, label: m[0].slice(0, 40) });
    }
    if (cands.length) break;
  }
  if (!cands.length) return null;
  const cnt = {};
  for (const c of cands) cnt[c.v] = (cnt[c.v] || 0) + 1;
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return { amount: parseFloat(best[0]), votes: best[1], sample: cands[0].label, source: 'text' };
}

async function waitFormReady(page, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate(() => {
      const fr = [...document.querySelectorAll('iframe')].map(f => {
        let d = null; try { d = f.contentDocument; } catch (e) {}
        const body = d && d.body ? (d.body.innerText || '') : '';
        const rich = /流水号|审批|申请/.test(body);
        return { rs: d ? d.readyState : 'n/a', len: body.length, rich };
      });
      return fr.some(f => (f.rs === 'complete' || f.rs === 'interactive') && f.rich && f.len > 60);
    }).catch(() => false);
    if (ok) return true;
    await wait(3000);
  }
  return false;
}

// 结构化收集：找到含“流水号”的 XForm frame，逐行读表格单元格（值单元格加 [V] 前缀）
async function collectStructured(page) {
  return page.evaluate(() => {
    let target = null;
    for (const f of [...document.querySelectorAll('iframe')]) {
      let d = null; try { d = f.contentDocument; } catch (e) { continue; }
      if (d && d.body && /流水号|申请/.test(d.body.innerText || '') && (d.body.innerText || '').length > 100) { target = d; break; }
    }
    if (!target) return null;
    const rows = [];
    for (const tr of target.body.querySelectorAll('table tr')) {
      const cells = [];
      for (const td of tr.children) {
        let t = (td.innerText || '').trim().replace(/\s+/g, ' ');
        if (!t) {
          const inp = td.querySelector('input,textarea,select');
          if (inp && inp.value && /[\d]/.test(inp.value)) t = '[V]' + inp.value.trim();
        }
        cells.push(t);
      }
      if (cells.some(c => c)) rows.push(cells);
    }
    return { rows, fullText: target.body.innerText || '' };
  });
}

function collectFormText(page) {
  return page.evaluate(() => {
    let all = [];
    const walk = (doc) => {
      try {
        if (doc.body) all.push(doc.body.innerText || '');
        doc.querySelectorAll('input,textarea').forEach(el => {
          if (el.value && /[\d]/.test(el.value)) all.push(el.value);
        });
        doc.querySelectorAll('iframe').forEach(f => {
          try { if (f.contentDocument) walk(f.contentDocument); } catch (e) {}
        });
      } catch (e) {}
    };
    walk(document);
    return all.join(' \n ');
  });
}

function saveCache(cache) {
  const tmp = CACHE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1), 'utf8');
  fs.renameSync(tmp, CACHE);
}

(async () => {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
  log(`缓存已有 ${Object.keys(cache).length} 条`);

  const b = await chromium.launch({
    headless: true, executablePath: EXE,
    args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn']
  });
  let added = 0, failed = [];
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    log('登录 BPM...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);

    const list = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetHistoryTasks&HistoryTaskType=MyRequest&SpecProcessName=&byYear=1&Year=2026&ThisTaskState=Running&page=1&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const j = JSON.parse((await r.text()).replace(/new Date\(([^)]+)\)/g, '"date"'));
      return (j.children || []).map(x => ({
        SN: x.SerialNum, TaskID: String(x.TaskID), StepID: String(x.StepID),
        State: (x.State && x.State.State) || 'running',
        Desc: x.Description || x.TaskTitle || '', Title: x.TaskTitle || x.ProcessName || ''
      })).filter(x => x.SN);
    });
    log(`审批中共 ${list.length} 条`);

    // 只清掉旧格式（无 ev 证据字段）的表单缓存；新格式带 ev 的保留，避免每次全量重抓
    let dropped = 0;
    for (const k of Object.keys(cache)) {
      const src = String(cache[k].source || '');
      if (src.startsWith('form') && src !== 'form_notfound' && !cache[k].ev) { delete cache[k]; dropped++; }
    }
    if (dropped) log(`已清除旧 form 来源缓存 ${dropped} 条（重抓）`);

    // 标题带金额 → 直接入库（不开表单）
    for (const t of list) {
      const ta = titleAmount(t.Desc || t.Title);
      if (ta !== null && !cache[t.SN]) {
        cache[t.SN] = { amount: ta, source: 'title', desc: t.Desc.slice(0, 80), fetched_at: new Date().toISOString().slice(0, 16) };
        added++;
      }
    }
    saveCache(cache);
    log(`标题带金额入库后缓存 ${Object.keys(cache).length} 条`);

    // 需要开表单的：无标题金额且缓存没有
    const todo = list.filter(t => cache[t.SN] === undefined);
    log(`需开表单补抓 ${todo.length} 条，预计 ${Math.ceil(todo.length * 35 / 60)} 分钟`);
    for (const [i, t] of todo.entries()) {
      log(`\n[${i + 1}/${todo.length}] ${t.SN} ${t.Desc.slice(0, 50)}`);
      // 我发起的·运行中的表单用 Read.aspx（UI 真实打开方式，无需 StepID）
      const url = `http://bpm.timesgroup.cn/YZSoft/Forms/Read.aspx?tid=${t.TaskID}&state=${t.State}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
        const ready = await waitFormReady(page, 120000);
        if (!ready) { log('  ✗ 表单超时'); failed.push(t.SN); continue; }
        const st = await collectStructured(page);
        let r = st ? formAmountStructured(st.rows) : null;
        if (r) {
          cache[t.SN] = { amount: r.amount, source: 'form', ev: r.ev, desc: t.Desc.slice(0, 80), fetched_at: new Date().toISOString().slice(0, 16) };
          added++;
          log(`  ✓ 金额 ${r.amount}（结构化: ${r.ev}）`);
        } else {
          const r2 = formAmount(st ? st.fullText : '');
          if (r2) {
            cache[t.SN] = { amount: r2.amount, source: 'form_text', ev: r2.sample, desc: t.Desc.slice(0, 80), fetched_at: new Date().toISOString().slice(0, 16) };
            added++;
            log(`  ✓ 金额 ${r2.amount}（文本回退: ${r2.sample}）`);
          } else {
            cache[t.SN] = { amount: null, source: 'form_notfound', desc: t.Desc.slice(0, 80), fetched_at: new Date().toISOString().slice(0, 16) };
            log('  ？表单里未识别到金额');
          }
        }
      } catch (e) {
        log('  ✗ 异常 ' + e.message.slice(0, 70));
        failed.push(t.SN);
        continue; // 失败不入缓存，下次重试
      }
      saveCache(cache);
      await wait(1000);
    }
    saveCache(cache);
    log(`\n完成：新增 ${added} 条，缓存共 ${Object.keys(cache).length} 条，失败 ${failed.length} 条${failed.length ? ': ' + failed.join(',') : ''}`);
  } finally {
    await safeClose(b);
  }
})();
