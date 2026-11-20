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
  const autoLogin = page.locator('button:has-text("自动登录"), a:has-text("自动登录")').first();
  if (await autoLogin.count() > 0) { await autoLogin.click(); await sleep(8000); }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await sleep(5000);
  console.log('页面就绪');

  // ===== 1. Year =====
  console.log('\n[1/4] 年份');
  const yearInput = page.locator('.el-form-item:has-text("年份") input.el-input__inner').first();
  await yearInput.click(); await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓ 2026');

  // ===== 2. Organizations via drawer =====
  console.log('\n[2/4] 预算组织 (drawer)');
  const orgInput = page.locator('.el-form-item:has-text("预算组织") input.el-input__inner').first();
  await orgInput.click();
  await sleep(3000);

  // Analyze the drawer
  const drawerData = await page.evaluate(() => {
    const drawer = document.querySelector('.el-drawer__container:not([style*="display: none"])');
    if (!drawer) return { found: false };
    
    const body = drawer.querySelector('.el-drawer__body');
    const header = drawer.querySelector('.el-drawer__header');
    const wrapper = drawer.querySelector('.el-drawer');
    
    const result = { 
      found: true,
      title: header ? header.textContent.trim() : '',
      visible: drawer.style.display !== 'none',
      wrapperClass: wrapper ? wrapper.className : ''
    };
    
    if (body) {
      result.bodyText = body.textContent.trim().substring(0, 500);
      result.bodyInputs = Array.from(body.querySelectorAll('input')).map(i => ({
        type: i.type, placeholder: i.placeholder, class: i.className.substring(0, 50), readonly: i.readOnly
      }));
      result.bodyButtons = Array.from(body.querySelectorAll('button')).map(b => b.textContent.trim());
      const trees = body.querySelectorAll('.el-tree, .el-tree-node');
      result.treeCount = trees.length;
      if (trees.length > 0) {
        const tree = body.querySelector('.el-tree');
        if (tree) {
          result.treeClass = tree.className;
          result.treeNodes = Array.from(tree.querySelectorAll('.el-tree-node')).slice(0, 15).map(n => {
            const label = n.querySelector('.el-tree-node__label');
            const cb = n.querySelector('.el-checkbox__input');
            return { label: label ? label.textContent.trim() : '', hasCheckbox: !!cb, isLeaf: n.classList.contains('is-leaf') };
          });
        }
      }
      // Also check for transfer component
      result.transferCount = body.querySelectorAll('.el-transfer').length;
    }
    
    // Footer buttons
    const wrapperEl = drawer.querySelector('.el-drawer');
    if (wrapperEl) {
      const footerBtns = wrapperEl.querySelectorAll('button');
      result.allButtons = Array.from(footerBtns).map(b => b.textContent.trim());
    }
    
    return result;
  });
  
  console.log('Drawer:', JSON.stringify(drawerData, null, 2));

  // Handle based on drawer content
  if (drawerData.treeCount > 0) {
    console.log('处理树形选择...');
    for (const code of ORG_CODES) {
      // Try to search in tree
      const searchInput = page.locator('.el-drawer__body input[type="text"]').first();
      if (await searchInput.count() > 0 && await searchInput.isVisible()) {
        await searchInput.fill('');
        await sleep(200);
        await searchInput.fill(code);
        await sleep(2000);
      }
      
      const node = page.locator(`.el-tree-node:has-text("${code}")`).first();
      if (await node.count() > 0) {
        const cb = node.locator('.el-checkbox__input').first();
        if (await cb.count() > 0) {
          await cb.click();
          console.log(`  ✓ ${code}`);
        } else {
          await node.click();
          console.log(`  ✓ ${code} (clicked node)`);
        }
      } else {
        console.log(`  ✗ ${code}`);
      }
      await sleep(300);
    }
  } else if (drawerData.transferCount > 0) {
    console.log('处理穿梭框...');
    // Transfer components have left/right panels
    for (const code of ORG_CODES) {
      const item = page.locator(`.el-transfer-panel__list .el-checkbox:has-text("${code}")`).first();
      if (await item.count() > 0) {
        await item.click();
        console.log(`  ✓ ${code}`);
      } else {
        console.log(`  ✗ ${code}`);
      }
    }
  }

  // Click确定button in drawer
  const drawerOk = page.locator('.el-drawer button:has-text("确定")').first();
  if (await drawerOk.count() > 0 && await drawerOk.isVisible()) {
    await drawerOk.click();
    await sleep(1000);
    console.log('  已点确定');
  } else {
    // Close drawer
    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // ===== 3. Budget Item =====
  console.log('\n[3/4] 预算科目');
  
  // The budget item might be a cascader - check the "级联选择" label
  // Try clicking the input in the 预算科目 form-item
  const itemInput = page.locator('.el-form-item:has-text("预算科目") input.el-input__inner').first();
  console.log('Item input count:', await itemInput.count());
  
  if (await itemInput.count() > 0) {
    await itemInput.click();
    await sleep(2000);
    
    // Check what opened
    const openState = await page.evaluate(() => {
      const drawer = document.querySelector('.el-drawer__wrapper:not([style*="display: none"])');
      const dialog = document.querySelector('.el-dialog__wrapper:not([style*="display: none"])');
      const cascader = document.querySelector('.el-cascader__suggestion-panel');
      const cascaderMenus = document.querySelector('.el-cascader-menus');
      const popper = document.querySelector('.el-cascader-panel, .el-popper');
      
      return {
        hasDrawer: !!drawer,
        hasDialog: !!dialog,
        hasCascader: !!cascader || !!cascaderMenus,
        hasPopper: !!popper,
        popperClass: popper ? popper.className : '',
      };
    });
    console.log('打开状态:', JSON.stringify(openState));
    
    if (openState.hasCascader) {
      // Navigate cascader
      console.log('处理级联选择器...');
      const menus = page.locator('.el-cascader-menus .el-cascader-menu');
      const menuCount = await menus.count();
      console.log('Cascader菜单数:', menuCount);
      
      // Click first item in first menu to expand
      await menus.first().locator('li').first().click();
      await sleep(500);
      
      // Look for 13403 in any menu
      const target = page.locator('.el-cascader-node__label:has-text("13403")').first();
      if (await target.count() > 0) {
        await target.click();
        await sleep(500);
        console.log('  ✓ 13403');
      }
    } else if (openState.hasDrawer) {
      // Another drawer
      const drawerSearch = page.locator('.el-drawer__body input[type="text"]').first();
      if (await drawerSearch.count() > 0) {
        await drawerSearch.fill('13403');
        await sleep(1500);
      }
      const match = page.locator('.el-drawer__body .el-tree-node:has-text("13403")').first();
      if (await match.count() > 0) {
        await match.locator('.el-checkbox__input').first().click();
        await sleep(500);
        console.log('  ✓ 13403');
      }
      
      const okBtn = page.locator('.el-drawer button:has-text("确定")').first();
      if (await okBtn.count() > 0 && await okBtn.isVisible()) {
        await okBtn.click();
        await sleep(1000);
      }
    } else {
      // Just try typing
      await itemInput.fill('');
      await itemInput.fill('13403');
      await sleep(500);
      console.log('  直接输入13403');
    }
    
    await page.keyboard.press('Escape');
    await sleep(500);
  }
  console.log('预算科目完成');

  // ===== 4. Query =====
  console.log('\n[4/4] 查询');
  const queryBtn = page.locator('button:has-text("查询")').first();
  if (await queryBtn.count() > 0) {
    await queryBtn.click();
    console.log('已点击');
    await sleep(8000);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await sleep(3000);
  }

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n✅ budget_result.png');
  
  // Check if data was loaded
  const tableRows = await page.locator('.el-table__body tr').count();
  console.log('表格行数:', tableRows);

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message, '\n', err.stack);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
