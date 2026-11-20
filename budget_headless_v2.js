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
  // Kill existing chrome to unlock profile
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  // Copy profile
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
  console.log('URL:', page.url());

  // Auto-login
  const autoLoginBtn = page.locator('button:has-text("自动登录"), a:has-text("自动登录")').first();
  if (await autoLoginBtn.count() > 0) {
    console.log('点击自动登录...');
    await autoLoginBtn.click();
    await sleep(8000);
  }

  // Wait for BudgetView
  for (let i = 0; i < 20; i++) {
    if (page.url().includes('BudgetView')) break;
    await sleep(2000);
  }
  console.log('最终URL:', page.url());

  if (!page.url().includes('BudgetView')) {
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_login_error.png'), fullPage: true });
    console.log('登录失败');
    await context.close();
    return;
  }

  // Wait for render
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await sleep(5000);

  // Dump page structure
  const labels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('label, .ant-form-item-label')).map(l => l.textContent.trim()).filter(t => t.length > 0 && t.length < 50);
  });
  console.log('标签:', labels.join(' | '));

  // Take initial screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_debug_0_initial.png'), fullPage: true });
  console.log('初始截图已保存');

  // ===== 1. Select Year =====
  console.log('\n=== [1/4] 选择年份 ===');
  let yearDone = false;
  
  // Try clicking the select with text matching
  const allSelects = page.locator('.ant-select');
  const selectCount = await allSelects.count();
  console.log('页面上ant-select数量:', selectCount);
  
  // Try clicking on the form-item containing "年份"
  await page.locator('.ant-form-item:has-text("年份") .ant-select').first().click().catch(() => {});
  await sleep(2000);
  
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  if (await dropdown.count() > 0) {
    await dropdown.locator('li:has-text("2026")').first().click().catch(() => {});
    await sleep(1000);
    console.log('年份选择完成');
    yearDone = true;
  }
  
  if (!yearDone) {
    // Fallback: try direct click on the first select
    await allSelects.first().click();
    await sleep(2000);
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("2026")').first().click().catch(() => {});
    await sleep(1000);
    console.log('年份选择(备用方式)完成');
  }

  // ===== 2. Select Budget Organizations =====
  console.log('\n=== [2/4] 选择预算组织 ===');
  
  // Try to find the org select - could be simple select or cascader
  const orgSelects = page.locator('.ant-form-item:has-text("预算组织") .ant-select');
  console.log('预算组织select数量:', await orgSelects.count());
  
  if (await orgSelects.count() > 0) {
    await orgSelects.first().click();
    await sleep(3000);
    
    // Wait for dropdown
    const orgDropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const treeDropdown = page.locator('.ant-cascader-menus');
    const treeSelectDropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-tree');
    
    console.log('Dropdown visible:', await orgDropdown.count() > 0);
    console.log('Tree dropdown visible:', await treeDropdown.count() > 0);
    console.log('TreeSelect dropdown visible:', await treeSelectDropdown.count() > 0);
    
    // Take debug screenshot of dropdown
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_debug_1_org_open.png'), fullPage: true });
    
    // Try tree select approach first
    if (await treeSelectDropdown.count() > 0 || await treeDropdown.count() > 0) {
      console.log('使用树形选择...');
      // It's a tree select - try to search and select
      const searchInput = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-search__field, .ant-select-dropdown:not(.ant-select-dropdown-hidden) input[type="text"]').first();
      
      for (const code of ORG_CODES) {
        if (await searchInput.count() > 0 && await searchInput.isVisible()) {
          await searchInput.click();
          await searchInput.fill('');
          await sleep(300);
          await searchInput.fill(code);
          await sleep(2000);
        }
        
        // Try clicking tree node
        const treeNode = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-tree-treenode:has-text("${code}"), .ant-select-dropdown:not(.ant-select-dropdown-hidden) span:has-text("${code}")`).first();
        if (await treeNode.count() > 0) {
          await treeNode.click();
          await sleep(500);
          console.log(`  ✓ ${code}`);
        } else {
          console.log(`  ✗ ${code} 未找到`);
        }
      }
    } else {
      // Regular searchable select
      for (const code of ORG_CODES) {
        const searchInput = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-search__field').first();
        if (await searchInput.count() > 0 && await searchInput.isVisible()) {
          await searchInput.fill(code);
          await sleep(2000);
        }
        const opt = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("${code}")`).first();
        if (await opt.count() > 0 && await opt.isVisible()) {
          await opt.click();
          await sleep(500);
          console.log(`  ✓ ${code}`);
        } else {
          console.log(`  ✗ ${code} 未找到`);
        }
      }
    }
    
    await page.keyboard.press('Escape');
    await sleep(1000);
  } else {
    console.log('⚠ 未找到预算组织选择器');
  }
  
  // Take debug screenshot after org selection
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_debug_2_org_selected.png'), fullPage: true });

  // ===== 3. Select Budget Item =====
  console.log('\n=== [3/4] 选择预算科目 ===');
  const itemRow = page.locator('.ant-form-item:has-text("预算科目")');
  console.log('预算科目form-item数量:', await itemRow.count());
  
  if (await itemRow.count() > 0) {
    // Try cascader first
    const cascader = itemRow.locator('.ant-cascader-picker').first();
    const select = itemRow.locator('.ant-select').first();
    
    if (await cascader.count() > 0) {
      console.log('使用cascader选择科目...');
      await cascader.click();
      await sleep(2000);
      
      // Navigate cascader levels - try searching
      const cascaderMenu = page.locator('.ant-cascader-menus');
      if (await cascaderMenu.count() > 0) {
        // Try clicking first level items
        const firstMenu = cascaderMenu.locator('.ant-cascader-menu').first();
        const items = firstMenu.locator('li');
        console.log('Cascader一级选项数量:', await items.count());
        
        // Try each first-level item to find 13403
        const count = await items.count();
        for (let i = 0; i < Math.min(count, 20); i++) {
          const text = await items.nth(i).textContent();
          console.log(`  [${i}] ${text.trim()}`);
        }
        
        // Just click the first one and see what happens
        await items.first().click();
        await sleep(1000);
        
        // Now try to search in the cascader
        // Take screenshot of cascader state
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_debug_3_cascader.png'), fullPage: true });
        
        // Try to find 13403 in cascader
        const targetInCascader = page.locator('.ant-cascader-menu li:has-text("13403")').first();
        if (await targetInCascader.count() > 0) {
          await targetInCascader.click();
          await sleep(500);
          console.log('  在cascader中找到13403');
        }
      }
      await page.keyboard.press('Escape');
    } else if (await select.count() > 0) {
      console.log('使用select选择科目...');
      await select.click();
      await sleep(2000);
      const si = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-search__field').first();
      if (await si.count() > 0 && await si.isVisible()) {
        await si.fill(BUDGET_ITEM_KEYWORD);
        await sleep(1500);
      }
      await page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("${BUDGET_ITEM_KEYWORD}")`).first().click().catch(() => {});
      await page.keyboard.press('Escape');
    }
    await sleep(1000);
    console.log('预算科目选择完成');
  }

  // ===== 4. Query =====
  console.log('\n=== [4/4] 查询 ===');
  const btn = page.locator('button:has-text("查询"), button:has-text("搜索")').first();
  console.log('查询按钮数量:', await btn.count());
  
  if (await btn.count() > 0) {
    await btn.click();
    console.log('已点击查询');
    await sleep(5000);
    // Wait for data - try different indicators
    try {
      await page.waitForSelector('.ant-table-tbody, .ant-spin-container, table', { timeout: 15000 });
      console.log('检测到表格/数据容器');
    } catch {
      console.log('未检测到明显的数据容器');
    }
    await sleep(5000);
  } else {
    console.log('⚠ 未找到查询按钮');
    
    // Try other button texts
    const allBtns = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.length > 0);
    });
    console.log('所有按钮:', allBtns.join(', '));
  }

  // ===== Final Screenshot =====
  const resultPath = path.join(OUTPUT_DIR, 'budget_result.png');
  await page.screenshot({ path: resultPath, fullPage: true });
  console.log('\n✅ 截图已保存: reports/budget_result.png');

  await context.close();
  console.log('完成');

})().catch(async err => {
  console.error('错误:', err.message, err.stack);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
