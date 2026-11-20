const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile_headless';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];
const YEAR = '2026';

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

  console.log('启动headless...');
  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true, channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  
  const autoLogin = page.locator('button:has-text("自动登录"), a:has-text("自动登录")').first();
  if (await autoLogin.count() > 0) { await autoLogin.click(); await sleep(8000); }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  
  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);
  console.log('页面就绪');

  // ===== 1. Select Year =====
  console.log('\n[1/4] 选择年份');
  const yearInput = page.locator('.el-form-item:has-text("年份") input.el-input__inner').first();
  await yearInput.click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓ 年份=2026');

  // ===== 2. Select Organizations - analyze dialog =====
  console.log('\n[2/4] 选择预算组织');
  const orgInput = page.locator('.el-form-item:has-text("预算组织") input.el-input__inner').first();
  await orgInput.click();
  await sleep(2000);

  // Analyze the dialog that opened
  const dialogInfo = await page.evaluate(() => {
    const dialogs = document.querySelectorAll('.el-dialog__wrapper:not([style*="display: none"])');
    const drawers = document.querySelectorAll('.el-drawer__container');
    const modals = document.querySelectorAll('.v-modal');
    
    const result = { dialogs: dialogs.length, drawers: drawers.length, modals: modals.length };
    
    if (dialogs.length > 0) {
      const d = dialogs[0];
      const title = d.querySelector('.el-dialog__title');
      const body = d.querySelector('.el-dialog__body');
      const footer = d.querySelector('.el-dialog__footer');
      
      result.dialogTitle = title ? title.textContent.trim() : 'none';
      
      if (body) {
        // Find inputs, trees, tables in body
        const inputs = body.querySelectorAll('input');
        result.bodyInputs = Array.from(inputs).map(i => ({ type: i.type, placeholder: i.placeholder, class: i.className.substring(0, 60) }));
        
        const trees = body.querySelectorAll('.el-tree-node');
        result.treeNodes = Array.from(trees).slice(0, 20).map(n => {
          const label = n.querySelector('.el-tree-node__label');
          const checkbox = n.querySelector('.el-checkbox');
          return { label: label ? label.textContent.trim() : '', hasCheckbox: !!checkbox };
        });
        
        const tables = body.querySelectorAll('table');
        result.tables = tables.length;
        
        const buttons = body.querySelectorAll('button');
        result.buttons = Array.from(buttons).map(b => b.textContent.trim());
        
        const allText = body.textContent.trim().substring(0, 500);
        result.bodyText = allText;
        
        // Check if there's a search input
        const searchInputs = body.querySelectorAll('input[type="text"], input:not([type]), .el-input__inner');
        result.searchInputs = Array.from(searchInputs).map(s => ({
          placeholder: s.placeholder,
          class: s.className.substring(0, 60),
          readonly: s.readOnly,
          value: s.value
        }));
      }
      
      if (footer) {
        result.footerButtons = Array.from(footer.querySelectorAll('button')).map(b => b.textContent.trim());
      }
    }
    return result;
  });
  
  console.log('Dialog info:', JSON.stringify(dialogInfo, null, 2));

  // If tree nodes found, select them
  if (dialogInfo.treeNodes && dialogInfo.treeNodes.length > 0) {
    for (const code of ORG_CODES) {
      const node = page.locator(`.el-tree-node__label:has-text("${code}")`).first();
      if (await node.count() > 0) {
        // Find the checkbox and click it
        const parent = node.locator('..');
        const checkbox = parent.locator('.el-checkbox__input').first();
        if (await checkbox.count() > 0) {
          await checkbox.click();
          console.log(`  ✓ ${code}`);
        } else {
          await node.click();
          console.log(`  ✓ ${code} (clicked label)`);
        }
        await sleep(300);
      } else {
        console.log(`  ✗ ${code}`);
      }
    }
    
    // Click OK
    const okBtn = page.locator('.el-dialog__footer button:has-text("确定"), .el-dialog button:has-text("确定")').first();
    if (await okBtn.count() > 0 && await okBtn.isVisible()) {
      await okBtn.click();
      await sleep(1000);
      console.log('  已点确定');
    }
  } else if (dialogInfo.searchInputs && dialogInfo.searchInputs.length > 0) {
    // Try search approach
    const searchInput = page.locator('.el-dialog__body input[type="text"]').first();
    if (await searchInput.count() > 0) {
      for (const code of ORG_CODES) {
        await searchInput.fill(code);
        await sleep(1500);
        // Try to find and click matching result
        const match = page.locator(`.el-dialog__body :has-text("${code}")`).first();
        if (await match.count() > 0) {
          await match.click();
          console.log(`  ✓ ${code}`);
        }
        await sleep(500);
      }
    }
  } else {
    // Fallback: try to type org codes directly or close dialog
    console.log('  ⚠ 无法识别对话框内容，截图保存');
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_org_dialog.png'), fullPage: true });
    await page.keyboard.press('Escape');
  }

  // ===== 3. Select Budget Item =====
  console.log('\n[3/4] 选择预算科目');
  const itemInput = page.locator('.el-form-item:has-text("预算科目") input.el-input__inner').first();
  if (await itemInput.count() > 0) {
    await itemInput.click();
    await sleep(2000);
    
    // Check what opened
    const itemDialog = await page.evaluate(() => {
      const d = document.querySelector('.el-dialog__wrapper:not([style*="display: none"])');
      if (!d) return { type: 'none' };
      const body = d.querySelector('.el-dialog__body');
      return {
        type: 'dialog',
        title: d.querySelector('.el-dialog__title')?.textContent?.trim(),
        bodyText: body ? body.textContent.trim().substring(0, 300) : ''
      };
    });
    console.log('Item dialog:', JSON.stringify(itemDialog));
    
    // Try to search for 13403
    const searchBox = page.locator('.el-dialog__body input[type="text"]').first();
    if (await searchBox.count() > 0) {
      await searchBox.fill('13403');
      await sleep(1500);
    }
    
    // Try to click matching item
    const match = page.locator('.el-dialog__body :has-text("13403")').first();
    if (await match.count() > 0) {
      await match.click();
      await sleep(500);
      console.log('  ✓ 找到13403');
    }
    
    // Click OK if needed
    const okBtn2 = page.locator('.el-dialog__footer button:has-text("确定"), .el-dialog button:has-text("确定")').first();
    if (await okBtn2.count() > 0 && await okBtn2.isVisible()) {
      await okBtn2.click();
      await sleep(1000);
    }
  }
  console.log('预算科目完成');

  // ===== 4. Query =====
  console.log('\n[4/4] 查询');
  const queryBtn = page.locator('button:has-text("查询")').first();
  if (await queryBtn.count() > 0) {
    await queryBtn.click();
    console.log('已点击查询');
    await sleep(8000);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await sleep(3000);
  }

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n✅ budget_result.png');

  await context.close();
  console.log('完成');

})().catch(async err => {
  console.error('错误:', err.message, '\n', err.stack);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
