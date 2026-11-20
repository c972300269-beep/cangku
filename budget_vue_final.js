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
  console.log('✓');

  // ===== Org via Vue showRef =====
  console.log('\n[2] 预算组织 - Vue showRef');
  await page.evaluate(() => {
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (!orgItem) return;
    const ref = orgItem.querySelector('.h-pro-edit-control--ref');
    if (ref && ref.__vue__) {
      ref.__vue__.showRef();
    }
  });
  await sleep(3000);

  // Check dialog
  let dlgVis = await page.evaluate(() => {
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    return dlg ? dlg.style.display !== 'none' : false;
  });
  console.log('Dialog visible:', dlgVis);

  if (dlgVis) {
    // Dump dialog content
    const dlgContent = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      if (!dlg) return {};
      const title = dlg.querySelector('.el-dialog__title');
      const body = dlg.querySelector('.el-dialog__body');
      return {
        title: title ? title.textContent.trim() : '',
        buttons: Array.from(dlg.querySelectorAll('button')).map(b => b.textContent.trim()),
        inputs: body ? Array.from(body.querySelectorAll('input')).map(i => ({
          type: i.type, placeholder: i.placeholder || '', class: typeof i.className === 'string' ? i.className.substring(0, 50) : ''
        })) : [],
        treeCount: body ? body.querySelectorAll('.el-tree-node').length : 0,
        treeLabels: body ? Array.from(body.querySelectorAll('.el-tree-node__label')).slice(0, 20).map(l => l.textContent.trim()) : [],
        bodyText: body ? body.textContent.trim().substring(0, 300) : '',
      };
    });
    console.log('Dialog内容:', JSON.stringify(dlgContent, null, 2));

    // Search and select orgs
    if (dlgContent.inputs && dlgContent.inputs.length > 0) {
      const searchInput = page.locator('.el-dialog__wrapper.h-pro-ref-tree input[type="text"]').first();
      for (const code of ORG_CODES) {
        await searchInput.fill(code);
        await sleep(2000);
        
        // Try to check the tree node
        const checked = await page.evaluate((code) => {
          const nodes = document.querySelectorAll('.el-tree-node');
          for (const node of nodes) {
            const label = node.querySelector('.el-tree-node__label');
            if (label && label.textContent.includes(code)) {
              const cb = node.querySelector('.el-checkbox__input');
              if (cb) {
                cb.click();
                return true;
              }
              label.click();
              return true;
            }
          }
          return false;
        }, code);
        console.log(`  ${code}: ${checked ? '✓' : '✗'}`);
        await sleep(300);
      }
    }
    
    // Click确定
    await page.locator('.el-dialog__wrapper.h-pro-ref-tree button:has-text("确定")').first().click().catch(() => {});
    await sleep(1000);
    console.log('  确定');
  } else {
    console.log('✗ 对话框未打开');
  }

  // ===== Budget Item via Vue showRef =====
  console.log('\n[3] 预算科目 - Vue showRef');
  await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算科目'));
    if (!item) return;
    const ref = item.querySelector('.h-pro-edit-control--ref');
    if (ref && ref.__vue__) {
      ref.__vue__.showRef();
    }
  });
  await sleep(3000);

  let itemDlgVis = await page.evaluate(() => {
    const dlgs = document.querySelectorAll('.el-dialog__wrapper:not(.h-pro-ref-tree):not([style*="display: none"])');
    return dlgs.length;
  });
  console.log('科目Dialog:', itemDlgVis);

  if (itemDlgVis > 0) {
    // Search for 13403
    const si = page.locator('.el-dialog__wrapper:not([style*="display: none"]) input[type="text"]').first();
    if (await si.count() > 0) {
      await si.fill('13403');
      await sleep(2000);
    }
    
    // Click on matching tree node or item
    await page.evaluate(() => {
      const nodes = document.querySelectorAll('.el-tree-node__label, .el-cascader-node__label, li');
      for (const node of nodes) {
        if (node.textContent.includes('13403')) {
          node.click();
          return;
        }
      }
    });
    await sleep(500);
    
    // Click确定
    await page.locator('.el-dialog__wrapper:not(.h-pro-ref-tree):not([style*="display: none"]) button:has-text("确定")').first().click().catch(() => {});
    await sleep(1000);
    console.log('  预算科目完成');
  }

  // ===== Query =====
  console.log('\n[4] 查询');
  await page.locator('button:has-text("查询")').first().click();
  console.log('已点击');
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(3000);

  const rows = await page.locator('.el-table__body tr').count();
  const empty = await page.locator('.el-table__empty-text').count();
  console.log(`表格: ${rows}行, 空状态: ${empty > 0}`);

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n✅ budget_result.png');

  // Preview if data
  if (rows > 0) {
    const preview = await page.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__body tr');
      return Array.from(rows).slice(0, 3).map(r => {
        return Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim().substring(0, 30));
      });
    });
    console.log('数据:', JSON.stringify(preview));
  }

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
