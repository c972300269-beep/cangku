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

  // Set year first
  console.log('[1] 年份');
  await page.locator('.el-form-item:has-text("年份") input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓');

  // ===== Org: find the trigger element =====
  console.log('\n[2] 分析预算组织组件');
  
  // Examine the org form-item structure
  // Get the org form-item element using Playwright then pass to evaluate
  const orgElement = page.locator('.el-form-item').filter({ hasText: '预算组织' }).first();
  const orgHandle = await orgElement.elementHandle().catch(() => null);
  
  if (!orgHandle) { console.log('未找到预算组织元素'); await context.close(); return; }
  
  const orgItemHtml = await page.evaluate((item) => {
    if (!item) return { error: 'not found' };
    
    // Get all children recursively
    function dump(el, depth) {
      if (depth > 5 || !el) return null;
      const result = {
        tag: el.tagName,
        class: typeof el.className === 'string' ? el.className.substring(0, 80) : 'SVG',
        attrs: {},
      };
      // Key attributes
      for (const attr of ['data-v', 'placeholder', 'readonly', '@click', 'v-on:click', 'onclick']) {
        if (el.getAttribute(attr)) result.attrs[attr] = el.getAttribute(attr).substring(0, 50);
      }
      // Event listeners (can't easily get, but can check if element is clickable)
      if (el.children.length > 0) {
        result.children = Array.from(el.children).map(c => dump(c, depth + 1)).filter(Boolean);
      }
      return result;
    }
    
    const content = item.querySelector('.el-form-item__content') || item.querySelector('.h-pro-edit-control--ref');
    if (!content) return { error: 'no content found', html: item.outerHTML.substring(0, 500) };
    
    return {
      html: item.outerHTML.substring(0, 2000),
      dom: dump(content, 0),
    };
  }, orgHandle);
  
  console.log('组件信息:', JSON.stringify(orgItemHtml, null, 2));

  // ===== Try different click targets =====
  console.log('\n[3] 尝试打开抽屉...');
  
  // Target 1: The h-pro-edit-control wrapper
  await page.locator('.el-form-item:has-text("预算组织") .h-pro-edit-control--ref').first().click().catch(() => {});
  await sleep(2000);
  
  // Check if drawer opened
  let drawerState = await page.evaluate(() => {
    const dw = document.querySelector('.el-drawer__wrapper');
    if (!dw) return { error: 'no wrapper' };
    return { display: dw.style.display, hasContent: dw.textContent.trim().length > 50 };
  });
  console.log('Target1后 drawer:', drawerState);
  
  if (drawerState.display !== 'none' && drawerState.display !== '') {
    console.log('  ✓ 抽屉已打开!');
  } else {
    // Target 2: Click input inside the ref component
    await page.locator('.el-form-item:has-text("预算组织") .el-input__inner').first().click().catch(() => {});
    await sleep(2000);
    drawerState = await page.evaluate(() => {
      const dw = document.querySelector('.el-drawer__wrapper');
      return dw ? { display: dw.style.display || 'block' } : { error: 'no wrapper' };
    });
    console.log('Target2后 drawer:', drawerState);
  }
  
  if (drawerState.display === 'none') {
    // Target 3: Click the suffix icon
    await page.locator('.el-form-item:has-text("预算组织") .el-input__suffix, .el-form-item:has-text("预算组织") i').first().click().catch(() => {});
    await sleep(2000);
    drawerState = await page.evaluate(() => {
      const dw = document.querySelector('.el-drawer__wrapper');
      return dw ? { display: dw.style.display || 'block' } : { error: 'no wrapper' };
    });
    console.log('Target3后 drawer:', drawerState);
  }

  // If still not open, try focusing and pressing Enter
  if (drawerState.display === 'none') {
    await page.locator('.el-form-item:has-text("预算组织") .el-input__inner').first().focus();
    await page.keyboard.press('Enter');
    await sleep(2000);
    drawerState = await page.evaluate(() => {
      const dw = document.querySelector('.el-drawer__wrapper');
      return dw ? { display: dw.style.display || 'block' } : { error: 'no wrapper' };
    });
    console.log('Enter后 drawer:', drawerState);
  }

  // Take final screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n截图: budget_result.png');

  // If drawer is now open, dump its content
  if (drawerState.display !== 'none') {
    const content = await page.evaluate(() => {
      const dw = document.querySelector('.el-drawer__wrapper');
      if (!dw) return {};
      return {
        buttons: Array.from(dw.querySelectorAll('button')).map(b => b.textContent.trim()),
        inputs: Array.from(dw.querySelectorAll('input')).map(i => ({ type: i.type, class: i.className.substring(0, 40), placeholder: i.placeholder })),
        treeNodes: Array.from(dw.querySelectorAll('.el-tree-node__label')).slice(0, 15).map(l => l.textContent.trim()),
        text: dw.textContent.trim().substring(0, 500),
      };
    });
    console.log('Drawer内容:', JSON.stringify(content, null, 2));
  }

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message, '\n', err.stack);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
