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
  // 1. 杀 Chrome + 创建临时 profile
  console.log('清理旧 Chrome...');
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);

  // 创建临时 profile 目录
  console.log('创建临时 profile 并复制登录态...');
  if (fs.existsSync(TMP_PROFILE)) fs.rmSync(TMP_PROFILE, { recursive: true, force: true });

  const srcDefault = SRC_PROFILE + '/Default';
  const dstDefault = TMP_PROFILE + '/Default';
  fs.mkdirSync(dstDefault, { recursive: true });

  // 只复制关键登录态文件
  const loginFiles = [
    'Cookies', 'Cookies-journal',
    'Login Data', 'Login Data-journal',
    'Web Data', 'Web Data-journal',
    'Preferences',
  ];
  for (const f of loginFiles) {
    const src = srcDefault + '/' + f;
    if (fs.existsSync(src)) {
      try { fs.copyFileSync(src, dstDefault + '/' + f); } catch {}
    }
  }
  // 复制 Local Storage
  const lsSrc = srcDefault + '/Local Storage';
  const lsDst = dstDefault + '/Local Storage';
  if (fs.existsSync(lsSrc)) {
    try { fs.cpSync(lsSrc, lsDst, { recursive: true }); } catch {}
  }
  // 复制 Network 目录（含 cookies）
  const netSrc = srcDefault + '/Network';
  const netDst = dstDefault + '/Network';
  if (fs.existsSync(netSrc)) {
    try { fs.cpSync(netSrc, netDst, { recursive: true }); } catch {}
  }
  // 复制 Local State
  const localState = SRC_PROFILE + '/Local State';
  if (fs.existsSync(localState)) {
    try { fs.copyFileSync(localState, TMP_PROFILE + '/Local State'); } catch {}
  }
  // 复制 First Run 标记文件
  fs.writeFileSync(TMP_PROFILE + '/First Run', '');
  console.log('  完成');

  // 2. 启动 Chrome
  console.log('启动 Chrome with CDP...');
  const chromeProcess = spawn(CHROME_EXE, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${TMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    URL,
  ], { stdio: 'pipe' });

  chromeProcess.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('ERROR')) console.log('  [Chrome] ' + s.trim().split('\n')[0]);
  });

  // 3. 等待 CDP
  console.log('等待 CDP 就绪...');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const resp = await httpGet(`http://localhost:${CDP_PORT}/json/version`);
      if (resp.ok) { ready = true; break; }
    } catch {}
    await sleep(1000);
    if (i % 5 === 4) console.log(`  ${i + 1}s...`);
  }
  if (!ready) throw new Error('CDP 超时');

  // 4. 连接 Playwright
  console.log('连接 Playwright...');
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  await sleep(5000);

  // 5. 检查登录
  const isLogin = await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"]').count();
  if (isLogin > 0) {
    console.log('需要手动登录！请在弹出的 Chrome 窗口中登录（120秒超时）...');
    try {
      await page.waitForURL(u => u.includes('BudgetView'), { timeout: 120000 });
      await sleep(3000);
    } catch { console.log('超时，继续...'); }
  }
  console.log('页面已就绪 ✓');

  // 6. 操作
  console.log('\n===== 开始操作 =====');

  // 年份
  console.log('[1/4] 选择年份: ' + YEAR);
  await page.locator('.ant-form-item, .ant-row').filter({ hasText: '年份' }).first()
    .locator('.ant-select-selector, .ant-picker').first().click();
  await sleep(2000);
  await page.locator('.ant-select-item-option:has-text("2026"), li:has-text("2026"), td:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('  ✓');

  // 预算组织
  console.log('[2/4] 选择预算组织...');
  await page.locator('.ant-form-item, .ant-row').filter({ hasText: '预算组织' }).first()
    .locator('.ant-select-selector, .ant-cascader-picker').first().click();
  await sleep(2000);
  await page.waitForSelector('.ant-select-dropdown:visible, .ant-cascader-menus:visible', { timeout: 5000 }).catch(() => {});

  for (const code of ORG_CODES) {
    const searchBox = page.locator('.ant-select-dropdown input, .ant-cascader-menus input').first();
    if (await searchBox.count() > 0 && await searchBox.isVisible()) {
      await searchBox.fill(code);
      await sleep(1500);
    }
    const opt = page.locator(`.ant-select-item-option:has-text("${code}")`).first();
    if (await opt.count() > 0 && await opt.isVisible()) {
      await opt.click();
      await sleep(500);
      console.log(`  ✓ ${code.split(' - ')[0]}`);
    } else {
      console.log(`  ✗ ${code.split(' - ')[0]} 未找到`);
    }
  }
  await page.keyboard.press('Escape');
  await sleep(1000);

  // 预算科目
  console.log('[3/4] 选择预算科目...');
  await page.locator('.ant-form-item, .ant-row').filter({ hasText: '预算科目' }).first()
    .locator('.ant-select-selector, .ant-cascader-picker').first().click();
  await sleep(2000);
  await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 5000 }).catch(() => {});

  const sb = page.locator('.ant-select-dropdown input').first();
  if (await sb.count() > 0 && await sb.isVisible()) {
    await sb.fill(BUDGET_ITEM_KEYWORD);
    await sleep(1500);
  }
  await page.locator(`.ant-select-item-option:has-text("${BUDGET_ITEM_KEYWORD}")`).first().click().catch(() => {});
  await page.keyboard.press('Escape');
  await sleep(1000);
  console.log('  ✓');

  // 查询
  console.log('[4/4] 查询数据...');
  await page.locator('button').filter({ hasText: /查询|搜索/ }).first().click();
  await sleep(8000);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(3000);

  // 截图
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n✅ 截图已保存: reports/budget_result.png');
  console.log('60秒后自动关闭...');
  await sleep(60000);

  await browser.close();
  chromeProcess.kill();
  console.log('完成');

})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
