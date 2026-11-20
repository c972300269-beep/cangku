const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER_DATA = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';
const CDP_PORT = 9222;

const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];
const YEAR = '2026';
const BUDGET_ITEM_KEYWORD = '13403';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const http = require(url.startsWith('https') ? 'https' : 'http');
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode < 400, data }));
    }).on('error', reject);
  });
}

(async () => {
  // 1. 彻底杀 Chrome
  console.log('清理 Chrome 进程...');
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  // 2. 删除 Chrome 锁文件
  const lockFile = USER_DATA + '/SingletonLock';
  try { fs.unlinkSync(lockFile); } catch {}
  const lockSocket = USER_DATA + '/SingletonSocket';
  try { fs.unlinkSync(lockSocket); } catch {}
  const lockCookie = USER_DATA + '/SingletonCookie';
  try { fs.unlinkSync(lockCookie); } catch {}
  console.log('  已清理锁文件');

  // 3. 启动 Chrome with CDP
  console.log('启动 Chrome（使用你的登录态）...');
  const chromeProcess = spawn(CHROME_EXE, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    URL,
  ], { stdio: 'ignore' });

  // 4. 等待 CDP 就绪
  console.log('等待 CDP 就绪...');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const resp = await httpGet(`http://localhost:${CDP_PORT}/json/version`);
      if (resp.ok) { ready = true; break; }
    } catch {}
    await sleep(1000);
    if (i % 5 === 4) console.log(`  等待中...(${i + 1}s)`);
  }
  if (!ready) throw new Error('CDP 未就绪');

  // 5. 连接 Playwright
  console.log('连接 Playwright...');
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  await sleep(5000);

  // 6. 检查登录
  const isLogin = await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"]').count();
  if (isLogin > 0) {
    console.log('需要登录！请在弹出的 Chrome 窗口中登录...');
    try {
      await page.waitForURL(u => u.includes('BudgetView'), { timeout: 120000 });
      await sleep(3000);
      console.log('登录完成');
    } catch { console.log('登录超时，继续...'); }
  } else {
    console.log('已登录 ✓');
  }

  // 7. 探索结构
  console.log('\n===== 开始操作 =====');
  const structure = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ant-form-item, .ant-row'))
      .map(row => {
        const label = row.querySelector('label')?.textContent?.trim();
        return label || null;
      }).filter(Boolean);
  });
  console.log('表单项:', structure.join(', '));

  // 8. 选择年份
  console.log('\n[1/4] 选择年份: ' + YEAR);
  const yearRow = page.locator('.ant-form-item, .ant-row').filter({ hasText: '年份' }).first();
  if (await yearRow.count() > 0) {
    await yearRow.locator('.ant-select-selector, .ant-picker').first().click();
    await sleep(2000);
  }
  await page.locator('.ant-select-item-option-content:has-text("2026"), li:has-text("2026"), .ant-picker-cell-in-view:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('  ✓');

  // 9. 选择预算组织
  console.log('\n[2/4] 选择预算组织...');
  const orgRow = page.locator('.ant-form-item, .ant-row').filter({ hasText: '预算组织' }).first();
  if (await orgRow.count() > 0) {
    await orgRow.locator('.ant-select-selector, .ant-cascader-picker').first().click();
    await sleep(2000);
  }
  await page.waitForSelector('.ant-select-dropdown:visible, .ant-cascader-menus:visible', { timeout: 5000 }).catch(() => {});

  for (const code of ORG_CODES) {
    console.log(`  选择: ${code}`);
    // 如果有搜索框，输入
    const searchBox = page.locator('.ant-select-dropdown input[type="text"], .ant-cascader-menus input').first();
    if (await searchBox.count() > 0 && await searchBox.isVisible()) {
      await searchBox.click();
      await searchBox.fill('');
      await sleep(200);
      await searchBox.fill(code);
      await sleep(1500);
    }
    const opt = page.locator(`.ant-select-item-option:has-text("${code}"), .ant-cascader-menu-item:has-text("${code}")`).first();
    if (await opt.count() > 0 && await opt.isVisible()) {
      await opt.click();
      await sleep(500);
      console.log('    ✓');
    } else {
      console.log('    ✗ 未找到, 跳过');
    }
  }
  await page.keyboard.press('Escape');
  await sleep(1000);

  // 10. 选择预算科目
  console.log('\n[3/4] 选择预算科目: ' + BUDGET_ITEM_KEYWORD);
  const itemRow = page.locator('.ant-form-item, .ant-row').filter({ hasText: '预算科目' }).first();
  if (await itemRow.count() > 0) {
    await itemRow.locator('.ant-select-selector, .ant-cascader-picker').first().click();
    await sleep(2000);
  }
  await page.waitForSelector('.ant-select-dropdown:visible, .ant-cascader-menus:visible', { timeout: 5000 }).catch(() => {});

  const searchBox2 = page.locator('.ant-select-dropdown input[type="text"]').first();
  if (await searchBox2.count() > 0 && await searchBox2.isVisible()) {
    await searchBox2.fill(BUDGET_ITEM_KEYWORD);
    await sleep(1500);
  }
  const opt2 = page.locator(`.ant-select-item-option:has-text("${BUDGET_ITEM_KEYWORD}")`).first();
  if (await opt2.count() > 0 && await opt2.isVisible()) {
    await opt2.click();
    console.log('  ✓');
  }
  await page.keyboard.press('Escape');
  await sleep(1000);

  // 11. 点击查询
  console.log('\n[4/4] 点击查询...');
  const queryBtn = page.locator('button').filter({ hasText: /查询|搜索|Query/ }).first();
  if (await queryBtn.count() > 0) {
    await queryBtn.click();
    await sleep(8000);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(3000);
  }

  // 12. 截图
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
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
