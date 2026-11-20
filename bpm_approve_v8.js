const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BPM_URL = 'http://bpm.timesgroup.cn';
const REPORT_DIR = path.join(__dirname, '..', '..', 'reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN', ignoreHTTPSErrors: true
  });

  const page = await ctx.newPage();

  async function getWorklist() {
    return await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      const text = await r.text();
      const clean = text.replace(/new Date\(([^)]+)\)/g, '"date"');
      try {
        const d = JSON.parse(clean);
        return (d.children || []).map(t => ({
          SerialNum: t.SerialNum, TaskID: t.TaskID, StepID: t.StepID,
          ProcessName: t.ProcessName, Description: t.Description, NodeName: t.NodeName
        }));
      } catch(e) { return []; }
    });
  }

  async function dumpPage(step) {
    return await page.evaluate(() => {
      // Tabs
      const tabs = [...document.querySelectorAll('.x-tab, [class*=tab] span, .x-tab-text')]
        .map(el => el.textContent.trim()).filter(Boolean);
      // Windows/dialogs
      const wins = [...document.querySelectorAll('.x-window, .x-panel, [class*=window]')]
        .filter(el => el.offsetParent !== null && el.style.display !== 'none')
        .map(el => ({ 
          cls: (el.className||'').substring(0,40), 
          text: (el.innerText||'').substring(0,200)
        }));
      // Iframes
      const iframes = [...document.querySelectorAll('iframe')]
        .map(f => ({ 
          id: f.id, name: f.name,
          src: (f.src||'').substring(0,150),
          visible: f.offsetParent !== null
        }));
      
      return { tabs: tabs.slice(0,10), wins: wins.slice(0,5), iframes };
    });
  }

  try {
    log('登录...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    log('等待加载...');
    for (let i = 0; i < 20; i++) {
      await wait(3000);
      const ok = await page.evaluate(() => {
        const t = document.body ? document.body.innerText || '' : '';
        return t.includes('REQ') && t.includes('待审批');
      });
      if (ok) { log(`  ✓ ${i+1}次`); break; }
      log(`  ${i+1}...`);
    }

    let tasks = await getWorklist();
    log(`待办: ${tasks.length}条`);
    tasks.forEach(t => console.log(`  [${t.SerialNum}] ${t.ProcessName} - ${t.Description}`));
    if (tasks.length === 0) { await browser.close(); return; }

    // === STRATEGY: Double-click row to open form ===
    const targetSN = tasks[0].SerialNum;
    log(`\n=== 双击打开: ${targetSN} ===`);

    // Double click the grid row
    const dblClickResult = await page.evaluate((sn) => {
      // Find the grid row
      const items = document.querySelectorAll('.x-grid-item, .x-grid-row, [class*=grid-item]');
      for (const item of items) {
        if (item.textContent.includes(sn)) {
          item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
          return 'dblclick on ' + (item.className||'').substring(0,50);
        }
      }
      return 'not found';
    }, targetSN);
    log(`双击: ${dblClickResult}`);
    await wait(8000);

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_dblclick.png') });
    
    let state = await dumpPage();
    log(`打开后: tabs=${JSON.stringify(state.tabs)}  wins=${state.wins.length}  iframes=${state.iframes.length}`);

    if (state.iframes.length > 0) {
      log(`  Iframes:`);
      state.iframes.forEach(f => log(`    [${f.id}] ${f.src}`));
    }

    // Check if new tab opened
    const newTabs = state.tabs.filter(t => t !== '流程执行' && t !== '待审批' && t !== '流程门户');
    if (newTabs.length > 0) {
      log(`  新Tabs: ${newTabs.join(', ')}`);
    }

    // === Check for form in iframes ===
    if (state.iframes.length > 0) {
      log('\n检查iframe内容...');
      for (const f of state.iframes) {
        const iframeContent = await page.evaluate((id) => {
          try {
            const iframe = document.getElementById(id) || document.querySelector(`iframe[name="${id}"]`) || document.querySelectorAll('iframe')[0];
            if (!iframe) return { id, error: 'iframe not found' };
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc || !doc.body) return { id, error: 'no body' };
            
            const body = doc.body;
            const text = (body.innerText || '').substring(0, 1000);
            // Find all buttons/links
            const btns = [...body.querySelectorAll('button, a, input[type=button], input[type=submit], span')]
              .map(el => (el.textContent || el.value || '').trim())
              .filter(t => t.length > 0 && t.length < 30);
            
            return { id, text, btns: btns.slice(0, 30), textLen: text.length };
          } catch(e) { return { id, error: e.message }; }
        }, f.id || f.name || 'if0');
        log(`  ${JSON.stringify(iframeContent, null, 2)}`);
      }
    }

    // === If form opened in a tab (not iframe), check all panels ===
    if (state.iframes.length === 0) {
      log('\n检查面板内容...');
      for (const win of state.wins) {
        if (win.text && (win.text.includes('同意') || win.text.includes('提交') || win.text.includes('审批'))) {
          log(`  找到审批面板: ${win.cls}`);
          log(`  内容: ${win.text.substring(0, 300)}`);
        }
      }

      // Look for approval-related text anywhere on page
      const allText = await page.evaluate(() => 
        document.body.innerText.substring(0, 2000)
      );
      
      // Check if there's new content indicating form opened
      const keyPhrases = ['同意', '提交', '退回', '审批意见', '备注', '通过'];
      for (const phrase of keyPhrases) {
        if (allText.includes(phrase)) {
          const idx = allText.indexOf(phrase);
          log(`  找到"${phrase}" at ${idx}: ...${allText.substring(Math.max(0,idx-50), idx+100)}`);
        }
      }
    }

    // === Try to click "同意" or "提交" wherever it appears ===
    log('\n尝试审批操作...');
    
    // First in iframes
    if (state.iframes.length > 0) {
      const iframeResult = await page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc) continue;
            for (const text of ['同意', '提交', '通过', '批准']) {
              const all = doc.querySelectorAll('button, a, span, input');
              for (const el of all) {
                const t = (el.textContent || el.value || '').trim();
                if (t === text) {
                  ['mousedown','mouseup','click'].forEach(e => 
                    el.dispatchEvent(new MouseEvent(e, { bubbles: true })));
                  return { inIframe: true, text };
                }
              }
            }
          } catch(e) {}
        }
        return null;
      });
      if (iframeResult) log(`  ✓ iframe中点击了"${iframeResult.text}"`);
      else log('  ✗ iframe中未找到审批按钮');
    } else {
      // Main page - click any approve button that appeared
      const mainResult = await page.evaluate(() => {
        for (const text of ['同意', '提交', '通过', '批准']) {
          for (const el of document.querySelectorAll('button, a, span, input')) {
            const t = (el.textContent || el.value || '').trim();
            if (t === text) {
              ['mousedown','mouseup','click'].forEach(e => 
                el.dispatchEvent(new MouseEvent(e, { bubbles: true })));
              return { text, tag: el.tagName };
            }
          }
        }
        return null;
      });
      if (mainResult) log(`  ✓ 主页面中点击了"${mainResult.text}"`);
      else log('  ✗ 未找到审批按钮');
    }

    await wait(5000);

    // Final verify
    const remaining = await getWorklist();
    const stillThere = remaining.some(t => t.SerialNum === targetSN);
    
    if (!stillThere) {
      log(`\n✅✅✅ 审批成功！${targetSN} 已移除`);
    } else {
      log(`\n⚠️ 审批未成功。剩余${remaining.length}条`);
      
      // One more try: check if there's a pending dialog/confirmation
      const finalCheck = await page.evaluate(() => {
        return {
          bodyLen: (document.body.innerText||'').length,
          hasOK: (document.body.innerText||'').includes('确定'),
          iframes: [...document.querySelectorAll('iframe')].length,
        };
      });
      log(`最终检查: ${JSON.stringify(finalCheck)}`);
    }

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_result.png') });

  } catch (e) {
    log(`错误: ${e.message}`);
  } finally {
    await browser.close();
    log('完成');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
