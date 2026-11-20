const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const CDP_PORT = 9222;

const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];
const YEAR = '2026';
const BUDGET_ITEM_KEYWORD = '13403';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // ===== Setup =====
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  if (fs.existsSync(TMP_PROFILE)) fs.rmSync(TMP_PROFILE, { recursive: true, force: true });
  const dstDefault = TMP_PROFILE + '/Default';
  fs.mkdirSync(dstDefault, { recursive: true });
  const srcDefault = SRC_PROFILE + '/Default';
  for (const f of ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Preferences']) {
    try { if (fs.existsSync(srcDefault + '/' + f)) fs.copyFileSync(srcDefault + '/' + f, dstDefault + '/' + f); } catch {}
  }
  for (const d of ['Local Storage', 'Network']) {
    try { if (fs.existsSync(srcDefault + '/' + d)) fs.cpSync(srcDefault + '/' + d, dstDefault + '/' + d, { recursive: true }); } catch {}
  }
  try { if (fs.existsSync(SRC_PROFILE + '/Local State')) fs.copyFileSync(SRC_PROFILE + '/Local State', TMP_PROFILE + '/Local State'); } catch {}
  fs.writeFileSync(TMP_PROFILE + '/First Run', '');

  const chromeProcess = spawn(CHROME_EXE, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${TMP_PROFILE}`,
    '--no-first-run', '--no-default-browser-check', URL,
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try {
      const http = require('http');
      const resp = await new Promise((resolve) => {
        http.get(`http://localhost:${CDP_PORT}/json/version`, (res) => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ ok: true, d }));
        }).on('error', () => resolve({ ok: false }));
      });
      if (resp.ok) break;
    } catch {}
    await sleep(1000);
  }

  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await sleep(5000);

  // Check login
  if (await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"]').count() > 0) {
    console.log('需要登录，请在 Chrome 窗口中登录...');
    try { await page.waitForURL(u => u.includes('BudgetView'), { timeout: 120000 }); await sleep(3000); } catch {}
  }
  console.log('页面已就绪');

  // Wait for Vue app to fully render (loading mask gone, form items appear)
  console.log('等待Vue渲染...');
  await page.waitForSelector('#loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('.ant-form-item, .ant-select, table, .ant-table', { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  console.log('渲染完成');

  // ===== Explore (one more time to confirm) =====
  const labels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ant-form-item-label label, label'))
      .map(l => l.textContent.trim())
      .filter(t => t.length > 0 && t.length < 50);
  });
  console.log('找到的标签:', labels.join(', '));

  // ===== 1. Select Year =====
  console.log('\n[1/4] 选择年份: ' + YEAR);
  // Click the select associated with "年份" label
  const yearSelect = page.locator('.ant-form-item').filter({ hasText: '年份' }).locator('.ant-select').first();
  if (await yearSelect.count() > 0) {
    await yearSelect.click();
  } else {
    // Fallback: find by label text proximity
    await page.locator('label:has-text("年份")').first().click();
    await sleep(500);
  }
  await sleep(1500);
  // Select 2026 from dropdown (antd-v1 uses ant-select-dropdown)
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("2026")').first().click();
  await sleep(1000);
  console.log('  ✓');

  // ===== 2. Select Budget Organizations =====
  console.log('[2/4] 选择预算组织...');
  const orgSelect = page.locator('.ant-form-item').filter({ hasText: '预算组织' }).locator('.ant-select').first();
  if (await orgSelect.count() > 0) {
    await orgSelect.click();
  }
  await sleep(2000);
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 5000 }).catch(() => {});

  for (const code of ORG_CODES) {
    console.log(`  选择: ${code}`);
    // Search in dropdown
    const searchInput = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-search__field').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill(code);
      await sleep(1500);
    }
    const opt = page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("${code}")`).first();
    if (await opt.count() > 0) {
      await opt.click();
      await sleep(500);
      console.log(`    ✓`);
    } else {
      console.log(`    ✗ 未找到, 跳过`);
    }
  }
  await page.keyboard.press('Escape');
  await sleep(1000);

  // ===== 3. Select Budget Item =====
  console.log('[3/4] 选择预算科目: ' + BUDGET_ITEM_KEYWORD);
  const itemSelect = page.locator('.ant-form-item').filter({ hasText: '预算科目' }).locator('.ant-select,.ant-cascader-picker').first();
  if (await itemSelect.count() > 0) {
    await itemSelect.click();
  }
  await sleep(2000);
  await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-cascader-menus', { timeout: 5000 }).catch(() => {});

  // If cascader, need to navigate tree
  const cascaderMenus = page.locator('.ant-cascader-menus');
  if (await cascaderMenus.count() > 0) {
    console.log('  检测到级联选择器');
    // Click through cascade levels
    await cascaderMenus.locator('.ant-cascader-menu').first().locator('li').first().click();
    await sleep(500);
  }

  const sb = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-search__field').first();
  if (await sb.count() > 0 && await sb.isVisible()) {
    await sb.fill(BUDGET_ITEM_KEYWORD);
    await sleep(1500);
  }
  await page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) li:has-text("${BUDGET_ITEM_KEYWORD}")`).first().click().catch(() => {
    // Try cascader
    page.locator('.ant-cascader-menu li:has-text("13403")').first().click().catch(() => {});
  });
  await page.keyboard.press('Escape');
  await sleep(1000);
  console.log('  ✓');

  // ===== 4. Query =====
  console.log('[4/4] 查询数据...');
  const queryBtn = page.locator('button:has-text("查询"), button:has-text("搜索")').first();
  if (await queryBtn.count() > 0) {
    await queryBtn.click();
    console.log('  等待数据加载...');
    await sleep(8000);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await sleep(3000);
  } else {
    console.log('  ⚠ 未找到查询按钮');
  }

  // ===== Screenshot =====
  const resultPath = path.join(OUTPUT_DIR, 'budget_result.png');
  await page.screenshot({ path: resultPath, fullPage: true });
  console.log('\n✅ 截图已保存: reports/budget_result.png');
  console.log('浏览器保持60秒查看...');
  await sleep(60000);

  await browser.close();
  chromeProcess.kill();
  console.log('完成');

})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
