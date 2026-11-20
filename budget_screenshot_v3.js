const { chromium } = require('playwright');
const path = require('path');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const USER_DATA_DIR = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];
const YEAR = '2026';
const BUDGET_ITEM_KEYWORD = '13403';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('正在启动系统 Chrome（使用你的登录态）...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    channel: 'chrome',  // 使用系统安装的 Chrome
    headless: false,
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    slowMo: 100,
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // ========== 步骤1：加载页面 ==========
    console.log('[1/6] 正在访问预算页面...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(5000);

    const isLoginPage = await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"]').count();
    if (isLoginPage > 0) {
      console.log('需要登录！请在弹出的浏览器窗口中手动登录...');
      try {
        await page.waitForURL(url => url.includes('budget_view') || url.includes('BudgetView'), { timeout: 120000 });
        await sleep(3000);
      } catch {
        console.log('登录超时，继续尝试...');
      }
    }
    console.log('页面已就绪');

    // ========== 步骤2：探索页面结构 ==========
    console.log('[2/6] 分析页面结构...');
    const structure = await page.evaluate(() => {
      const info = [];
      document.querySelectorAll('.ant-form-item, .ant-row').forEach(row => {
        const label = row.querySelector('.ant-form-item-label label, label')?.textContent?.trim();
        if (!label) return;
        const select = row.querySelector('.ant-select-selector, .ant-cascader-picker, .ant-picker, input');
        if (!select) return;
        const rect = select.getBoundingClientRect();
        info.push({
          label,
          type: select.className,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        });
      });
      return info;
    });

    console.log('找到的表单项:');
    structure.forEach(s => console.log(`  [${s.label}] type=${s.type.split(' ')[0]} pos=(${s.x},${s.y})`));

    // ========== 步骤3：选择年份 ==========
    console.log('[3/6] 选择年份: ' + YEAR);
    const yearRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=年份') }).first();
    if (await yearRow.count() > 0) {
      const sel = yearRow.locator('.ant-select-selector, .ant-picker').first();
      if (await sel.count() > 0) {
        await sel.click();
        await sleep(1500);
      }
    }
    // 在下拉中选2026
    await page.locator('.ant-select-item-option:has-text("2026"), li:has-text("2026"), .ant-picker-cell-in-view:has-text("2026")').first().click().catch(async () => {
      await page.locator('.ant-picker-year-btn').click().catch(() => {});
      await sleep(500);
      await page.locator('td:has-text("2026")').first().click().catch(() => {});
    });
    await sleep(1000);
    console.log('  已选择 ' + YEAR);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step1.png'), fullPage: true });

    // ========== 步骤4：选择预算组织 ==========
    console.log('[4/6] 选择预算组织...');
    const orgRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=预算组织') }).first();
    if (await orgRow.count() > 0) {
      const sel = orgRow.locator('.ant-select-selector, .ant-cascader-picker').first();
      if (await sel.count() > 0) {
        await sel.click();
        await sleep(1500);
      }
    }

    const dropdown = page.locator('.ant-select-dropdown:visible, .ant-cascader-menus:visible').first();
    await dropdown.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    for (const code of ORG_CODES) {
      console.log(`  选择: ${code}`);
      const searchInput = page.locator('.ant-select-dropdown input, .ant-cascader-menus input').first();
      if (await searchInput.count() > 0) {
        await searchInput.fill('');
        await sleep(300);
        await searchInput.fill(code);
        await sleep(1000);
      }
      const option = page.locator(`.ant-select-item:has-text("${code}"), .ant-cascader-menu-item:has-text("${code}")`).first();
      if (await option.count() > 0) {
        await option.click();
        await sleep(500);
        console.log(`    ✓ 已选`);
      } else {
        console.log(`    ✗ 未找到, 跳过`);
      }
    }
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await sleep(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step2.png'), fullPage: true });

    // ========== 步骤5：选择预算科目 ==========
    console.log('[5/6] 选择预算科目: ' + BUDGET_ITEM_KEYWORD);
    const itemRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=预算科目') }).first();
    if (await itemRow.count() > 0) {
      const sel = itemRow.locator('.ant-select-selector, .ant-cascader-picker').first();
      if (await sel.count() > 0) {
        await sel.click();
        await sleep(1500);
      }
    }

    const dropdown2 = page.locator('.ant-select-dropdown:visible, .ant-cascader-menus:visible').first();
    await dropdown2.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    const searchInput2 = page.locator('.ant-select-dropdown input').first();
    if (await searchInput2.count() > 0) {
      await searchInput2.fill(BUDGET_ITEM_KEYWORD);
      await sleep(1000);
    }

    const itemOption = page.locator(`.ant-select-item:has-text("${BUDGET_ITEM_KEYWORD}")`).first();
    if (await itemOption.count() > 0) {
      await itemOption.click();
      console.log('  ✓ 已选');
    }
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await sleep(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step3.png'), fullPage: true });

    // ========== 步骤6：查询并截图 ==========
    console.log('[6/6] 查询数据...');
    const queryBtn = page.locator('button:has-text("查询"), button:has-text("搜索"), button:has-text("Query")').first();
    if (await queryBtn.count() > 0) {
      await queryBtn.click();
      await sleep(5000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(2000);
    }

    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
    console.log('\n✅ 截图已保存: reports/budget_result.png');
    console.log('浏览器保持30秒后关闭...');
    await sleep(30000);

  } catch (err) {
    console.error('错误:', err.message);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_error.png'), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    console.log('完成');
  }
})();
