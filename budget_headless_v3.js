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
const BUDGET_ITEM_KEYWORD = '13403';

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

  console.log('[Headless] 启动浏览器...');
  const context = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true,
    channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1920,1080'],
  });

  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);

  // Auto-login
  const autoLoginBtn = page.locator('button:has-text("自动登录"), a:has-text("自动登录")').first();
  if (await autoLoginBtn.count() > 0) { await autoLoginBtn.click(); await sleep(8000); }

  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  console.log('URL:', page.url());

  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);

  // ===== Element UI based selectors =====

  // 1. Select Year — it's an el-date-editor--year
  console.log('\n[1/4] 选择年份:', YEAR);
  
  // Dump all form items to understand structure
  const formInfo = await page.evaluate(() => {
    const items = document.querySelectorAll('.el-form-item');
    return Array.from(items).map(item => {
      const label = item.querySelector('.el-form-item__label');
      const content = item.querySelector('.el-form-item__content');
      const children = content ? Array.from(content.children).map(c => ({
        tag: c.tagName,
        class: c.className.substring(0, 80),
        inputType: c.querySelector('input') ? c.querySelector('input').type : 'none',
        inputReadonly: c.querySelector('input') ? c.querySelector('input').readOnly : 'N/A',
        inputPlaceholder: c.querySelector('input') ? c.querySelector('input').placeholder : 'N/A'
      })) : [];
      return {
        label: label ? label.textContent.trim() : 'none',
        children
      };
    });
  });
  
  formInfo.forEach(f => {
    console.log(`  Label: "${f.label}"`);
    f.children.forEach(c => {
      console.log(`    <${c.tag}> class="${c.class}" inputType=${c.inputType} readonly=${c.inputReadonly} placeholder=${c.inputPlaceholder}`);
    });
  });

  // Click year input (el-date-editor--year)
  const yearInput = page.locator('.el-form-item:has-text("年份") .el-input__inner').first();
  console.log('年份input count:', await yearInput.count());
  
  if (await yearInput.count() > 0) {
    await yearInput.click();
    await sleep(1000);
    
    // Look for year picker
    const yearPicker = page.locator('.el-year-table td .cell, .el-date-picker__header-label, .el-picker-panel');
    console.log('Year picker visible:', await yearPicker.count() > 0);
    
    // Try to select 2026 from the year table
    await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
    await sleep(500);
    
    // Also try date editor approach - clear and type
    if (!await page.locator('.el-year-table').isVisible().catch(() => false)) {
      await yearInput.click();
      await sleep(500);
      await yearInput.fill('');
      await yearInput.fill(YEAR);
      await sleep(500);
    }
  }
  await sleep(1000);
  console.log('年份完成');

  // 2. Select Budget Organizations  
  console.log('\n[2/4] 选择预算组织...');
  
  // Find the org selector - could be an el-autocomplete or custom component
  // Try clicking the input in the 预算组织 form-item
  const orgInputs = page.locator('.el-form-item:has-text("预算组织") .el-input__inner');
  console.log('预算组织inputs count:', await orgInputs.count());
  
  // The budget org is probably the second readonly input
  for (let i = 0; i < await orgInputs.count(); i++) {
    const inp = orgInputs.nth(i);
    console.log(`  Input[${i}] readonly=${await inp.getAttribute('readonly')} placeholder="${await inp.getAttribute('placeholder')}"`);
  }
  
  // Click the non-readonly input or the first one
  const orgEditableInput = page.locator('.el-form-item:has-text("预算组织") .el-input__inner:not([readonly])').first();
  const orgClickTarget = (await orgEditableInput.count() > 0) ? orgEditableInput : orgInputs.first();
  
  if (await orgClickTarget.count() > 0) {
    await orgClickTarget.click();
    await sleep(1500);
    
    // Check what dropdown appeared
    const dropdowns = page.locator('.el-select-dropdown, .el-popper, .el-tree, .el-autocomplete-suggestion, el-dialog');
    console.log('可见下拉:', await dropdowns.count() > 0);
    
    // Try el-tree approach (tree select)
    const tree = page.locator('.el-tree');
    const treeVisible = await tree.count() > 0;
    console.log('树形组件:', treeVisible);
    
    if (treeVisible) {
      // The tree might be inside a dialog or dropdown
      // Try to search and check nodes
      for (const code of ORG_CODES) {
        const node = page.locator(`.el-tree-node:has-text("${code}")`).first();
        if (await node.count() > 0) {
          // Click the checkbox
          const checkbox = node.locator('.el-checkbox__input').first();
          if (await checkbox.count() > 0) {
            await checkbox.click();
            await sleep(300);
            console.log(`  ✓ ${code}`);
          }
        } else {
          console.log(`  ✗ ${code} 未在树中找到`);
        }
      }
    } else {
      // Try regular select dropdown
      for (const code of ORG_CODES) {
        const opt = page.locator(`.el-select-dropdown__item:has-text("${code}"), .el-select-dropdown:not([style*="display: none"]) li:has-text("${code}")`).first();
        if (await opt.count() > 0) {
          await opt.click();
          await sleep(300);
          console.log(`  ✓ ${code}`);
        } else {
          console.log(`  ✗ ${code}`);
        }
      }
    }
    
    // Close dropdown
    await page.keyboard.press('Escape');
    await sleep(500);
  }
  
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_debug_org.png'), fullPage: true });

  // 3. Select Budget Item
  console.log('\n[3/4] 选择预算科目...');
  
  const itemInputs = page.locator('.el-form-item:has-text("预算科目") .el-input__inner');
  console.log('预算科目inputs count:', await itemInputs.count());
  
  const itemClickTarget = itemInputs.first();
  if (await itemClickTarget.count() > 0) {
    await itemClickTarget.click();
    await sleep(1500);
    
    // Try to search in cascader/autocomplete
    const searchInput = page.locator('.el-autocomplete-suggestion input, .el-cascader__search-input, .el-select__input').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill(BUDGET_ITEM_KEYWORD);
      await sleep(1500);
    }
    
    // Try clicking matching item
    const match = page.locator(`li:has-text("${BUDGET_ITEM_KEYWORD}"), .el-cascader-node__label:has-text("${BUDGET_ITEM_KEYWORD}")`).first();
    if (await match.count() > 0) {
      await match.click();
      await sleep(500);
      console.log('  ✓ 找到并点击');
    }
    
    await page.keyboard.press('Escape');
    await sleep(500);
  }
  console.log('预算科目完成');

  // 4. Query
  console.log('\n[4/4] 查询...');
  const queryBtn = page.locator('button:has-text("查询"), button:has-text("搜索"), .el-button:has-text("查询")').first();
  console.log('查询按钮count:', await queryBtn.count());
  
  // Also check what buttons exist
  const allBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, .el-button')).map(b => b.textContent.trim()).filter(t => t.length > 0 && t.length < 20);
  });
  console.log('所有按钮:', allBtns.join(', '));
  
  if (await queryBtn.count() > 0) {
    await queryBtn.click();
    console.log('已点击查询');
    await sleep(8000);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await sleep(3000);
  }

  // Final screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n✅ 截图已保存: reports/budget_result.png');

  await context.close();
  console.log('完成');

})().catch(async err => {
  console.error('错误:', err.message, '\n', err.stack);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
