const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const USER_DATA_DIR = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];
const YEAR = '2026';
const BUDGET_ITEM_KEYWORD = '13403';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    slowMo: 100,
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // ========== 步骤1：加载页面 ==========
    console.log('[1/6] 正在访问预算页面...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(4000);

    // 检查是否需要登录
    const isLoginPage = await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"]').count();
    if (isLoginPage > 0) {
      console.log('需要登录！在弹出的浏览器窗口中手动登录...');
      try {
        await page.waitForURL(url => url.includes('budget_view'), { timeout: 120000 });
        await sleep(3000);
      } catch {
        console.log('登录超时，请确认是否已登录成功');
      }
    }
    console.log('页面已就绪');

    // ========== 步骤2：探索页面结构 ==========
    console.log('[2/6] 分析页面结构...');
    const structure = await page.evaluate(() => {
      const info = [];
      // 找到所有 ant-form-item，每个包含 label + 控件
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
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        });
      });
      return info;
    });

    console.log('找到的表单项:');
    structure.forEach(s => console.log(`  [${s.label}] type=${s.type} pos=(${s.x},${s.y})`));

    // ========== 步骤3：选择年份 ==========
    console.log('[3/6] 选择年份: ' + YEAR);

    // 点击年份选择器 - 通过 label 关联
    const yearRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=年份') }).first();
    let yearClicked = false;
    if (await yearRow.count() > 0) {
      // 点击该行中的下拉框
      const yearSelector = yearRow.locator('.ant-select-selector, .ant-picker').first();
      if (await yearSelector.count() > 0) {
        await yearSelector.click();
        await sleep(1500);
        yearClicked = true;
      }
    }

    if (!yearClicked) {
      // fallback: 点击包含"年份"的元素后面的下拉框
      await page.locator('text=年份').first().click();
      await sleep(500);
      await page.keyboard.press('Tab');
      await sleep(500);
      await page.keyboard.press('Enter');
      await sleep(1500);
    }

    // 在下拉列表中选2026
    const yearOption = page.locator('.ant-select-dropdown:visible, .ant-picker-dropdown:visible').first();
    await yearOption.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    // 尝试点击2026
    await page.locator('.ant-select-item-option:has-text("2026"), .ant-picker-cell:has-text("2026"), li:has-text("2026")').first().click().catch(async () => {
      // 如果是年份选择器(datepicker)，可能需要先选年
      await page.locator('.ant-picker-year-btn').click().catch(() => {});
      await sleep(500);
      await page.locator('td:has-text("2026"), .ant-picker-cell:has-text("2026")').first().click().catch(() => {});
      console.log('  尝试从年份面板选择2026');
    });
    await sleep(1000);
    console.log('  年份已选择: ' + YEAR);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step1.png'), fullPage: true });

    // ========== 步骤4：选择预算组织 ==========
    console.log('[4/6] 选择预算组织...');

    // 点击预算组织选择器
    const orgRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=预算组织') }).first();
    let orgClicked = false;
    if (await orgRow.count() > 0) {
      const orgSelector = orgRow.locator('.ant-select-selector, .ant-cascader-picker').first();
      if (await orgSelector.count() > 0) {
        await orgSelector.click();
        await sleep(1500);
        orgClicked = true;
      }
    }

    if (!orgClicked) {
      console.log('  ⚠ 未找到预算组织选择器，尝试备选方案...');
      // 尝试点击第二个下拉框
      const allSelects = page.locator('.ant-select-selector');
      const count = await allSelects.count();
      console.log(`  页面上有 ${count} 个选择器`);
      if (count >= 2) {
        await allSelects.nth(1).click();
        await sleep(1500);
        orgClicked = true;
      }
    }

    if (orgClicked) {
      // 等待下拉面板出现
      const dropdown = page.locator('.ant-select-dropdown:visible, .ant-cascader-menus:visible').first();
      await dropdown.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      // 选择每个组织
      for (const code of ORG_CODES) {
        console.log(`  选择组织: ${code}`);
        // 在下拉列表中搜索
        const searchInput = page.locator('.ant-select-dropdown input, .ant-cascader-menus input').first();
        if (await searchInput.count() > 0) {
          await searchInput.fill(code.substring(0, 15));
          await sleep(1000);
        }

        // 点击匹配的选项
        const option = page.locator(`.ant-select-item:has-text("${code}"), .ant-cascader-menu-item:has-text("${code.substring(code.length - 8)}")`).first();
        if (await option.count() > 0) {
          await option.click();
          await sleep(500);
          console.log(`    ✓ 已选择: ${code}`);
        } else {
          console.log(`    ✗ 未找到: ${code}`);
        }
      }

      // 关闭下拉框（点击空白处）
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await sleep(1000);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step2.png'), fullPage: true });

    // ========== 步骤5：选择预算科目 ==========
    console.log('[5/6] 选择预算科目: ' + BUDGET_ITEM_KEYWORD);

    const itemRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=预算科目') }).first();
    let itemClicked = false;
    if (await itemRow.count() > 0) {
      const itemSelector = itemRow.locator('.ant-select-selector, .ant-cascader-picker').first();
      if (await itemSelector.count() > 0) {
        await itemSelector.click();
        await sleep(1500);
        itemClicked = true;
      }
    }

    if (!itemClicked) {
      console.log('  ⚠ 未找到预算科目选择器，尝试备选方案...');
      const allSelects = page.locator('.ant-select-selector');
      const count = await allSelects.count();
      if (count >= 3) {
        await allSelects.nth(2).click();
        await sleep(1500);
        itemClicked = true;
      }
    }

    if (itemClicked) {
      const dropdown = page.locator('.ant-select-dropdown:visible, .ant-cascader-menus:visible').first();
      await dropdown.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      const searchInput = page.locator('.ant-select-dropdown input').first();
      if (await searchInput.count() > 0) {
        await searchInput.fill(BUDGET_ITEM_KEYWORD);
        await sleep(1000);
      }

      const option = page.locator(`.ant-select-item:has-text("${BUDGET_ITEM_KEYWORD}"), .ant-cascader-menu-item:has-text("${BUDGET_ITEM_KEYWORD}")`).first();
      if (await option.count() > 0) {
        await option.click();
        await sleep(500);
        console.log('  ✓ 已选择: ' + BUDGET_ITEM_KEYWORD);
      } else {
        console.log('  ✗ 未找到: ' + BUDGET_ITEM_KEYWORD);
      }

      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await sleep(1000);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step3.png'), fullPage: true });

    // ========== 步骤6：点击查询并截图 ==========
    console.log('[6/6] 点击查询，等待数据加载...');

    const queryBtn = page.locator('button:has-text("查询"), button:has-text("搜索"), button:has-text("Query")').first();
    if (await queryBtn.count() > 0) {
      await queryBtn.click();
      await sleep(5000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(2000);
    } else {
      console.log('  ⚠ 未找到查询按钮');
    }

    // 最终截图
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
    console.log('\n✅ 最终截图已保存: reports/budget_result.png');

    // 同时也分步截图保留
    console.log('中间步骤截图: budget_step1.png, budget_step2.png, budget_step3.png');
    console.log('\n浏览器保持30秒供检查...');
    await sleep(30000);

  } catch (err) {
    console.error('错误:', err.message);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_error.png'), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    console.log('完成');
  }
})();
