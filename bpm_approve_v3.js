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

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();
  page.on('pageerror', err => log(`[ERR] ${err.message?.substring(0, 120)}`));

  try {
    // === Login ===
    log('登录BPM...');
    await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(12000);
    log(`标题: ${await page.title()}`);

    // === Get tasks via API ===
    log('获取待办...');
    const worklistRaw = await page.evaluate(async () => {
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
      return await r.text();
    });
    const clean = worklistRaw.replace(/new Date\(([^)]+)\)/g, (m, args) => {
      const parts = args.split(',').map(p => parseInt(p.trim()));
      return '"' + new Date(parts[0], parts[1], parts[2], parts[3]||0, parts[4]||0, parts[5]||0).toISOString() + '"';
    });
    const data = JSON.parse(clean);
    const tasks = data.children || [];
    
    if (tasks.length === 0) {
      log('无需审批');
      await browser.close();
      return;
    }
    log(`${tasks.length}条待办`);
    tasks.forEach((t, i) => console.log(`  ${i+1}. [${t.SerialNum}] ${t.ProcessName} - ${t.Description}`));

    // === Navigate to 待审批 tab ===
    log('\n打开待审批...');
    const navOk = await page.evaluate(() => {
      try {
        // Find and activate "待审批" tab
        const tabPanels = Ext.ComponentQuery.query('tabpanel');
        for (const tp of tabPanels) {
          const items = tp.items ? tp.items.items : [];
          for (const item of items) {
            if (item.title === '待审批') {
              tp.setActiveTab(item);
              return 'tab activated';
            }
          }
        }
        // Try clicking DOM
        const tabs = document.querySelectorAll('.x-tab');
        for (const t of tabs) {
          if (t.textContent.includes('待审批')) { t.click(); return 'DOM click'; }
        }
        return 'not found';
      } catch(e) { return 'error: ' + e.message; }
    });
    log(`导航: ${navOk}`);
    await wait(5000);

    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_grid.png') });
    log('截图: bpm_grid.png');

    // === Select first task row in grid and approve ===
    const targetSN = tasks[0].SerialNum;
    log(`\n处理任务: ${targetSN}`);

    // Click row to select it, then check if toolbar buttons enabled
    const selectResult = await page.evaluate((sn) => {
      try {
        const grids = Ext.ComponentQuery.query('gridpanel, grid');
        for (const g of grids) {
          const store = g.getStore();
          if (!store || !store.getCount) continue;
          
          for (let i = 0; i < store.getCount(); i++) {
            const rec = store.getAt(i);
            if (rec.get('SerialNum') === sn) {
              g.getSelectionModel().select(rec);
              return { selected: true, rowIdx: i };
            }
          }
        }
        return { selected: false, grids: grids.length };
      } catch(e) { return { error: e.message }; }
    }, targetSN);
    log(`选中行: ${JSON.stringify(selectResult)}`);

    await wait(2000);

    // Check which buttons are now enabled
    const btnState = await page.evaluate(() => {
      try {
        const btns = Ext.ComponentQuery.query('button').filter(b => 
          !b.hidden && !b.disabled && b.getText && b.getText().length > 0
        );
        return btns.map(b => ({ text: b.getText(), itemId: b.itemId }));
      } catch(e) { return [{ error: e.message }]; }
    });
    log(`可用按钮: ${JSON.stringify(btnState)}`);

    // === Click approve button ===
    // Try: "批量同意", "同意", "提交", "通过"
    const approveTexts = ['批量同意', '同意', '提交', '通过', '批准'];
    
    let approved = false;
    for (const approveText of approveTexts) {
      const clickResult = await page.evaluate((text) => {
        try {
          const btns = Ext.ComponentQuery.query('button');
          for (const b of btns) {
            const t = b.getText ? b.getText() : '';
            if (t === text && !b.disabled && !b.hidden) {
              b.handler && b.handler.call(b.scope || b, b);
              return { clicked: text, method: 'handler' };
            }
            if (t === text && !b.disabled && !b.hidden) {
              b.fireEvent('click', b);
              return { clicked: text, method: 'fireEvent' };
            }
          }
          return null;
        } catch(e) { return { error: e.message }; }
      }, approveText);
      
      if (clickResult && clickResult.clicked) {
        log(`✓ 点击了 "${clickResult.clicked}" 按钮`);
        approved = true;
        break;
      }
    }

    if (!approved) {
      // Try DOM click on toolbar buttons
      const domClick = await page.evaluate(() => {
        const allEls = document.querySelectorAll('a, button, span, div');
        for (const el of allEls) {
          const t = (el.textContent || '').trim();
          if (t === '批量同意' || t === '同意') {
            el.click();
            return 'DOM clicked: ' + t;
          }
        }
        return 'not found';
      });
      log(`DOM点击: ${domClick}`);
      approved = domClick.includes('clicked');
    }

    await wait(3000);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_after_approve.png') });

    // === Handle confirmation dialog ===
    log('\n检查确认弹窗...');
    const dialogResult = await page.evaluate(() => {
      try {
        const wins = Ext.ComponentQuery.query('window[hidden=false]');
        for (const w of wins) {
          const title = w.title || '';
          if (title.includes('提示') || title.includes('确认') || title.includes('审批') || title.includes('批')) {
            // Find "确定"/"是" button in dialog
            const dlgBtns = w.query('button');
            for (const b of dlgBtns) {
              const t = b.getText ? b.getText() : '';
              if (t === '确定' || t === '是' || t === '确认') {
                b.handler && b.handler.call(b.scope || b, b);
                return { confirmed: true, title, btn: t };
              }
            }
            return { found: true, title, btns: dlgBtns.map(b => b.getText ? b.getText() : '') };
          }
          // Check by content
          const el = w.getEl();
          if (el && el.dom) {
            const txt = el.dom.innerText || '';
            if (txt.includes('是否') || txt.includes('确认') || txt.includes('提示')) {
              return { found: true, content: txt.substring(0, 200) };
            }
          }
        }
        return { noDialog: true };
      } catch(e) { return { error: e.message }; }
    });
    log(`弹窗: ${JSON.stringify(dialogResult)}`);

    if (!dialogResult.confirmed && !dialogResult.noDialog) {
      // Try DOM approach for dialog
      const domConfirm = await page.evaluate(() => {
        for (const el of document.querySelectorAll('a, button, span')) {
          const t = (el.textContent || '').trim();
          if (t === '确定' || t === '是') {
            el.click();
            return 'DOM: ' + t;
          }
        }
        return 'no DOM confirm btn';
      });
      log(`DOM确认: ${domConfirm}`);
    }

    await wait(4000);

    // === Verify result ===
    log('\n验证审批结果...');
    const verifyResult = await page.evaluate(async (sn) => {
      try {
        const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList&start=0&limit=500&_dc=' + Date.now(), { credentials: 'include' });
        const text = await r.text();
        return {
          taskGone: !text.includes(sn),
          totalLen: text.length,
          preview: text.substring(0, 300)
        };
      } catch(e) { return { error: e.message }; }
    }, targetSN);
    
    log(`验证: ${JSON.stringify(verifyResult)}`);
    
    if (verifyResult.taskGone) {
      log(`\n✅ 成功！任务 ${targetSN} 已审批完成并从待办列表中移除。`);
    } else {
      log(`\n⚠️ 任务仍在待办列表中，可能未成功审批或需要在表单内操作`);
      await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_final_state.png') });
    }

  } catch (error) {
    log(`错误: ${error.message}`);
    await page.screenshot({ path: path.join(REPORT_DIR, 'bpm_error.png') }).catch(() => {});
  } finally {
    await browser.close();
    log('完成');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
