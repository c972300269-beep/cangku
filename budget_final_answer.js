const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile_headless';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  if (fs.existsSync(TMP_PROFILE)) fs.rmSync(TMP_PROFILE, { recursive: true, force: true });
  const dstDefault = TMP_PROFILE + '/Default';
  fs.mkdirSync(dstDefault, { recursive: true });
  const srcDefault = SRC_PROFILE + '/Default';
  for (const f of ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Preferences']) {
    try { if (fs.existsSync(srcDefault + '/' + f)) fs.copyFileSync(srcDefault + '/' + f, dstDefault + '/' + f); } catch {}
  }
  for (const d of ['Local Storage', 'Network', 'Session Storage']) {
    try { if (fs.existsSync(srcDefault + '/' + d)) fs.cpSync(srcDefault + '/' + d, dstDefault + '/' + d, { recursive: true }); } catch {}
  }
  try { if (fs.existsSync(SRC_PROFILE + '/Local State')) fs.copyFileSync(SRC_PROFILE + '/Local State', TMP_PROFILE + '/Local State'); } catch {}
  fs.writeFileSync(TMP_PROFILE + '/First Run', '');

  console.log('启动...');
  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true, channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    await page.locator('button:has-text("自动登录")').click(); await sleep(8000);
  }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);

  // Year
  console.log('[1] 年份');
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓ 2026');

  // ===== Org via Vue =====
  console.log('[2] 预算组织');
  
  // Open dialog by setting refVisible + clearing display
  await page.evaluate(() => {
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (!orgItem) return;
    const ref = orgItem.querySelector('.h-pro-edit-control--ref');
    if (ref && ref.__vue__) {
      ref.__vue__.refVisible = true;
    }
    // Also force show dialog
    setTimeout(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      if (dlg) {
        dlg.style.display = '';
        dlg.querySelector('.el-dialog')?.setAttribute('style', dlg.querySelector('.el-dialog').getAttribute('style') || '');
      }
    }, 500);
  });
  await sleep(5000); // Wait for dialog + tree to load

  // Search and select orgs in dialog
  const orgSearchInput = page.locator('.el-dialog__wrapper.h-pro-ref-tree input[type="text"]').first();
  for (const code of ORG_CODES) {
    await orgSearchInput.fill(code);
    await sleep(2000);
    
    await page.evaluate((code) => {
      const nodes = document.querySelectorAll('.el-tree-node');
      for (const node of nodes) {
        const label = node.querySelector('.el-tree-node__label');
        if (label && label.textContent.includes(code)) {
          const cb = node.querySelector('.el-checkbox__input');
          if (cb) { cb.click(); return true; }
          label.click();
          return true;
        }
      }
      return false;
    }, code).then(ok => console.log(`  ${code}: ${ok ? '✓' : '✗'}`));
    await sleep(300);
  }

  // Close the dialog first using Escape
  await page.keyboard.press('Escape');
  await sleep(1000);
  
  // Also force close via Vue
  await page.evaluate(() => {
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (dlg) dlg.style.display = 'none';
    // Also reset refVisible
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (orgItem) {
      const ref = orgItem.querySelector('.h-pro-edit-control--ref');
      if (ref && ref.__vue__) ref.__vue__.refVisible = false;
    }
  });
  await sleep(500);
  console.log('  确定');

  // ===== Budget Item =====
  console.log('[3] 预算科目');

  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算科目'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (ref && ref.__vue__) {
      ref.__vue__.refVisible = true;
    }
    setTimeout(() => {
      const dlg = document.querySelector('.el-dialog__wrapper:not(.h-pro-ref-tree):not([style*="display: none"])');
      if (!dlg) {
        // Find any dialog that's not the org one
        const allDlgs = document.querySelectorAll('.el-dialog__wrapper');
        for (const d of allDlgs) {
          if (!d.classList.contains('h-pro-ref-tree') && d.style.display === 'none') {
            d.style.display = '';
          }
        }
      }
    }, 500);
  });
  await sleep(3000);

  // Search for 13403
  const itemSearchInput = page.locator('.el-dialog__wrapper:not(.h-pro-ref-tree) input[type="text"]').first();
  const itemSiCount = await itemSearchInput.count();
  console.log('  搜索框:', itemSiCount);
  
  if (itemSiCount > 0) {
    await itemSearchInput.fill('13403');
    await sleep(2000);
  }

  // Wait longer for tree to load
  await sleep(2000);
  
  // Select matching node
  await page.evaluate(() => {
    const nodes = document.querySelectorAll('.el-tree-node__label, .el-cascader-node__label, li');
    for (const node of nodes) {
      if (node.textContent.includes('13403')) {
        const cb = node.closest('.el-tree-node, li')?.querySelector('.el-checkbox__input');
        if (cb) { cb.click(); return; }
        node.click();
        return;
      }
    }
  });
  await sleep(500);
  console.log('  预算科目完成');

  // Click确定
  const itemOkBtn = page.locator('.el-dialog__wrapper:not(.h-pro-ref-tree) button:has-text("确定")').first();
  if (await itemOkBtn.count() > 0) {
    await itemOkBtn.click({ timeout: 5000 }).catch(() => {});
    await sleep(1000);
  }

  // Close budget item dialog
  await page.keyboard.press('Escape');
  await sleep(500);
  await page.evaluate(() => {
    const allDlgs = document.querySelectorAll('.el-dialog__wrapper');
    for (const dlg of allDlgs) {
      dlg.style.display = 'none';
    }
  });
  await sleep(500);

  // ===== Query =====
  console.log('[4] 查询');
  await page.locator('button:has-text("查询")').first().click({ force: true, timeout: 10000 }).catch(() => {});
  console.log('已点击');
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(3000);

  const rows = await page.locator('.el-table__body tr').count();
  const empty = await page.locator('.el-table__empty-text').count();
  console.log(`表格: ${rows}行, 空: ${empty > 0}`);

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  
  if (rows > 0) {
    const preview = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('.el-table__header th')).map(h => h.textContent.trim());
      const dataRows = Array.from(document.querySelectorAll('.el-table__body tr')).slice(0, 5).map(r => 
        Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim())
      );
      return { headers: headers.slice(0, 10), rows: dataRows };
    });
    console.log('\n数据预览:');
    console.log('  Headers:', preview.headers.join(' | '));
    preview.rows.forEach((r, i) => console.log(`  [${i}]`, r.join(' | ')));
    console.log(`\n  共 ${rows} 行`);
  }

  console.log('\n✅ budget_result.png');
  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
