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

  console.log('启动headless...');
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
  console.log('就绪');

  // ===== 1. Year =====
  console.log('\n[1] 年份');
  await page.locator('.el-form-item:has-text("年份") input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓');

  // ===== 2. Orgs - click input, wait for drawer content, search & select =====
  console.log('\n[2] 预算组织');
  
  // Click the readonly input to open drawer
  await page.locator('.el-form-item:has-text("预算组织") input').first().click();
  await sleep(5000); // Wait for drawer to fully load

  // Dump drawer content
  const drawer = await page.evaluate(() => {
    const wrapper = document.querySelector('.el-drawer__wrapper:not([style*="display: none"])');
    if (!wrapper) return { found: false };
    
    // Get ALL text content
    const allText = wrapper.textContent.trim().substring(0, 800);
    
    // Find inputs
    const inputs = wrapper.querySelectorAll('input');
    const inputInfo = Array.from(inputs).map(i => ({
      type: i.type || 'text', placeholder: i.placeholder || '', className: i.className, value: i.value || ''
    }));
    
    // Find tree or list items
    const treeLabels = wrapper.querySelectorAll('.el-tree-node__label');
    const checkboxes = wrapper.querySelectorAll('.el-checkbox');
    const listItems = wrapper.querySelectorAll('.el-transfer-panel__item, .el-select-dropdown__item');
    const buttons = Array.from(wrapper.querySelectorAll('button')).map(b => b.textContent.trim());
    
    return {
      found: true,
      allText: allText.substring(0, 500),
      inputs: inputInfo,
      treeLabels: treeLabels.length,
      checkboxes: checkboxes.length,
      listItems: listItems.length,
      buttons: buttons,
      // Check for specific containers
      hasTree: wrapper.querySelector('.el-tree') !== null,
      hasTransfer: wrapper.querySelector('.el-transfer') !== null,
      hasTable: wrapper.querySelector('table') !== null,
    };
  });
  
  console.log('Drawer内容:', JSON.stringify(drawer, null, 2));

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_drawer.png'), fullPage: false });
  console.log('Drawer截图: budget_drawer.png');

  // Try to find and interact with the search/filter input in drawer
  if (drawer.inputs && drawer.inputs.length > 0) {
    // Try the first text input
    const searchInput = page.locator('.el-drawer__wrapper:not([style*="display: none"]) input[type="text"]').first();
    if (await searchInput.count() > 0) {
      for (const code of ORG_CODES) {
        try {
          await searchInput.click();
          await sleep(300);
          // Clear and type
          await searchInput.fill('');
          await sleep(200);
          await searchInput.type(code, { delay: 50 });
          await sleep(2000);
          
          // Look for matching tree node or checkbox
          const match = page.locator(`.el-drawer__wrapper .el-tree-node:has-text("${code}")`).first();
          if (await match.count() > 0 && await match.isVisible()) {
            const cb = match.locator('.el-checkbox__input').first();
            if (await cb.count() > 0) {
              await cb.click();
              console.log(`  ✓ ${code}`);
            } else {
              await match.click();
              console.log(`  ✓ ${code} (clicked)`);
            }
          } else {
            // Try transfer panel items
            const transferItem = page.locator(`.el-transfer-panel .el-checkbox__label:has-text("${code}")`).first();
            if (await transferItem.count() > 0) {
              await transferItem.click();
              console.log(`  ✓ ${code} (transfer)`);
            } else {
              console.log(`  ✗ ${code}`);
            }
          }
          await sleep(300);
        } catch (e) {
          console.log(`  ✗ ${code} error:`, e.message);
        }
      }
    }
  }

  // If tree labels or checkboxes found directly, try selecting
  if (drawer.treeLabels > 0 && drawer.buttons.length === 0) {
    // Try direct tree node selection
    for (const code of ORG_CODES) {
      const node = page.locator(`.el-tree-node__label:has-text("${code}")`).first();
      if (await node.count() > 0) {
        await node.click();
        console.log(`  ✓ ${code}`);
      }
      await sleep(200);
    }
  }

  // Click确定按钮
  const confirmBtn = page.locator('.el-drawer__wrapper button:has-text("确定")').first();
  if (await confirmBtn.count() > 0 && await confirmBtn.isVisible()) {
    await confirmBtn.click();
    await sleep(1000);
    console.log('  确定');
  } else {
    // Try footer buttons
    const footerBtns = await page.evaluate(() => {
      const drawer = document.querySelector('.el-drawer__wrapper:not([style*="display: none"])');
      if (!drawer) return [];
      return Array.from(drawer.querySelectorAll('button')).map(b => b.textContent.trim());
    });
    console.log('Footer按钮:', footerBtns);
    
    // Click确定if found
    const okBtn = page.locator('.el-drawer__wrapper button').filter({ hasText: '确定' }).first();
    if (await okBtn.count() > 0) {
      await okBtn.click();
      await sleep(500);
    } else {
      await page.keyboard.press('Escape');
      await sleep(500);
    }
  }

  // ===== 3. Budget Item - autocomplete =====
  console.log('\n[3] 预算科目 (autocomplete)');
  
  // First close any remaining drawer
  await page.keyboard.press('Escape');
  await sleep(1000);
  
  const itemInput = page.locator('.el-form-item:has-text("预算科目") input').first();
  await itemInput.click();
  await sleep(1000);
  
  // Try to type into the visible autocomplete input
  // The autocomplete might use a different input than the readonly display input
  const acInput = page.locator('.el-autocomplete input, .el-autocomplete-suggestion input, input.el-input__inner:not([readonly])').first();
  const targetInput = (await acInput.count() > 0) ? acInput : itemInput;
  
  try {
    await targetInput.fill('13403');
    await sleep(2000);
    
    // Look for autocomplete suggestions
    const suggestions = page.locator('.el-autocomplete-suggestion__list li');
    const sugCount = await suggestions.count();
    console.log('建议数量:', sugCount);
    
    if (sugCount > 0) {
      // Click the suggestion containing 13403
      const match = page.locator('.el-autocomplete-suggestion__list li:has-text("13403")').first();
      if (await match.count() > 0) {
        await match.click();
        await sleep(500);
        console.log('  ✓ 13403');
      }
    }
  } catch (e) {
    console.log('  ⚠', e.message);
  }
  
  await page.keyboard.press('Escape');
  await sleep(500);
  console.log('完成');

  // ===== 4. Query =====
  console.log('\n[4] 查询');
  await page.locator('button:has-text("查询")').first().click();
  console.log('已点击');
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(3000);

  // Check data
  const rows = await page.locator('.el-table__body tr').count();
  const empty = await page.locator('.el-table__empty-text').count();
  console.log(`表格行数: ${rows}, 空状态: ${empty > 0}`);

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n✅ budget_result.png');

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
