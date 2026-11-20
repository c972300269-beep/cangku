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
  // Kill any existing chrome to unlock profile
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  // Copy profile for auth
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
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  console.log('当前URL:', page.url());

  // Handle auto-login
  const autoLoginBtn = page.locator('button:has-text("自动登录"), a:has-text("自动登录"), span:has-text("自动登录")').first();
  if (await autoLoginBtn.count() > 0) {
    console.log('点击自动登录...');
    await autoLoginBtn.click();
    await sleep(8000);
    console.log('登录后URL:', page.url());
  }

  // Wait for redirect
  let attempts = 0;
  while (!page.url().includes('BudgetView') && attempts < 15) {
    await sleep(3000);
    attempts++;
    const loginInputs = await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"], input[placeholder*="密码"]').count();
    if (loginInputs > 0) {
      console.log('检测到登录页面，尝试自动登录按钮...');
      const btn = page.locator('button:has-text("自动登录"), a:has-text("自动登录"), button:has-text("登录")').first();
      if (await btn.count() > 0) {
        await btn.click();
        await sleep(8000);
      }
    }
  }

  if (!page.url().includes('BudgetView')) {
    console.log('⚠ 未能进入预算页面，当前URL:', page.url());
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_error.png'), fullPage: true });
    await context.close();
    return;
  }

  // Wait for render
  console.log('等待页面渲染...');
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await sleep(5000);

  // Debug: find form labels
  const labels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ant-form-item-label label, label'))
      .map(l => l.textContent.trim())
      .filter(t => t.length > 0 && t.length < 50);
  });
  console.log('找到的标签:', labels.join(', ') || '(空)');

  // ===== 1. Year =====
  console.log('\n[1/4] 选择年份:', YEAR);
  const yearRow = page.locator('.ant-form-item').filter({ hasText: '年份' }).first();
  if (await yearRow.count() > 0) {
    await yearRow.locator('.ant-select').first().click();
    await sleep(1500);
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("2026")').first().click();
    await sleep(1000);
    console.log('  ✓');
  }

  // ===== 2. Organizations =====
  console.log('[2/4] 选择预算组织...');
  const orgRow = page.locator('.ant-form-item').filter({ hasText: '预算组织' }).first();
  if (await orgRow.count() > 0) {
    await orgRow.locator('.ant-select').first().click();
    await sleep(2000);
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 5000 }).catch(() => {});

    for (const code of ORG_CODES) {
      const si = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-search__field').first();
      if (await si.count() > 0 && await si.isVisible()) {
        await si.fill(code);
        await sleep(1500);
      }
      const opt = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("${code}")`).first();
      if (await opt.count() > 0) {
        await opt.click();
        await sleep(500);
        console.log(`  ✓ ${code}`);
      } else {
        console.log(`  ✗ ${code} 未找到`);
      }
    }
    await page.keyboard.press('Escape');
    await sleep(1000);
  }

  // ===== 3. Budget Item =====
  console.log('[3/4] 选择预算科目...');
  const itemRow = page.locator('.ant-form-item').filter({ hasText: '预算科目' }).first();
  if (await itemRow.count() > 0) {
    await itemRow.locator('.ant-select,.ant-cascader-picker').first().click();
    await sleep(2000);
    await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-cascader-menus', { timeout: 5000 }).catch(() => {});

    const si = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-search__field').first();
    if (await si.count() > 0 && await si.isVisible()) {
      await si.fill(BUDGET_ITEM_KEYWORD);
      await sleep(1500);
    }
    await page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("${BUDGET_ITEM_KEYWORD}")`).first().click().catch(() => {});
    await page.keyboard.press('Escape');
    await sleep(1000);
    console.log('  ✓');
  }

  // ===== 4. Query =====
  console.log('[4/4] 查询...');
  const btn = page.locator('button:has-text("查询"), button:has-text("搜索")').first();
  if (await btn.count() > 0) {
    await btn.click();
    await sleep(8000);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await sleep(3000);
  }

  // ===== Final Screenshot =====
  const resultPath = path.join(OUTPUT_DIR, 'budget_result.png');
  await page.screenshot({ path: resultPath, fullPage: true });
  console.log('\n✅ 截图已保存: reports/budget_result.png');

  await context.close();
  console.log('完成');

})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
