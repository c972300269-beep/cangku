// debug_amount_dump.js — 转储一条表单的完整文本与表格结构
const { chromium } = require('playwright');
const wait = ms => new Promise(r => setTimeout(r, ms));
const EXE = 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const TID = process.argv[2] || '10989601'; // REQ20261052119 弱电维保（错误提取为1）

(async () => {
  const b = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--auth-server-allowlist=bpm.timesgroup.cn', '--auth-negotiate-delegate-allowlist=bpm.timesgroup.cn'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true })).newPage();
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(14000);
    await page.goto(`http://bpm.timesgroup.cn/YZSoft/Forms/Read.aspx?tid=${TID}&state=running`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    // 等表单就绪
    for (let i = 0; i < 30; i++) {
      const ok = await page.evaluate(() => {
        const fr = [...document.querySelectorAll('iframe')].map(f => {
          let d = null; try { d = f.contentDocument; } catch (e) {}
          const body = d && d.body ? (d.body.innerText || '') : '';
          return { rs: d ? d.readyState : 'n/a', len: body.length, rich: /流水号|申请/.test(body) };
        });
        return fr.some(f => (f.rs === 'complete' || f.rs === 'interactive') && f.rich && f.len > 60);
      }).catch(() => false);
      if (ok) break;
      await wait(3000);
    }
    await wait(3000);

    const info = await page.evaluate(() => {
      const out = {};
      for (const f of [...document.querySelectorAll('iframe')]) {
        let d = null; try { d = f.contentDocument; } catch (e) { continue; }
        if (!d || !d.body) continue;
        const txt = d.body.innerText || '';
        if (txt.length < 100) continue;
        out.fullText = txt;
        // 表格结构：每行单元格用 | 分隔
        const rows = [...d.body.querySelectorAll('table tr')].map(tr => [...tr.children].map(td => (td.innerText || '').trim().replace(/\s+/g, ' ')).filter(x => x !== '').join(' | ')).filter(r => r);
        out.tableRows = rows;
        // input 值
        out.inputs = [...d.body.querySelectorAll('input,textarea')].map(el => el.value).filter(v => v && /[\d]/.test(v));
        break;
      }
      return out;
    });
    console.log('===== fullText =====');
    console.log(info.fullText);
    console.log('===== 含金额的表格行 =====');
    for (const r of (info.tableRows || [])) if (/金额|元|费/.test(r)) console.log('  ' + r.slice(0, 200));
    console.log('===== inputs(含数字) =====');
    console.log((info.inputs || []).slice(0, 30).join(' , '));
  } finally { await b.close().catch(() => {}); }
})();
