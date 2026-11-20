const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const CHROME_EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

const ORG_CODES = ['GZ1-3001QYQCP008', 'GZ1-3001QYQCP009', 'GZ1-3001QYQCP036', 'QY1-3003QYP002'];
const YEAR = '2026';
const BUDGET_ITEM_KEYWORD = '13403';
const CDP_PORT = 9222;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  let chromeProcess = null;

  try {
    // ========== 手动启动 Chrome with CDP ==========
    console.log('正在启动 Chrome（带调试端口）...');

    // 复制 Chrome profile 到临时目录（避免与原Chrome冲突）
    const tmpDir = 'E:/workbuddy/Claw/.workbuddy/tmp/chrome_profile';
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    const srcProfile = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
    console.log('  正在复制 Chrome 配置文件（约需30秒）...');
    // 跳过不必要的大文件/目录
    const skipDirs = new Set([
      'GrShaderCache', 'ShaderCache', 'GPUCache', 'DawnGraphiteCache',
      'DawnWebGPUCache', 'VulkanCachedData', 'blob_storage',
      'Crashpad', 'BrowserMetrics', 'component_crx_cache',
      'extensions_crx_cache', 'FileTypePolicies', 'FirstPartySetsPreloaded',
      'GraphiteDawnCache', 'hyphen-data', 'MediaFoundationWidevineCdm',
      'MEIPreload', 'OnDeviceHeadSuggestModel', 'OpenCookieDatabase',
      'OptimizationHints', 'OriginTrials', 'PKIMetadata',
      'pnacl', 'recovery', 'Safe Browsing', 'SafetyTips',
      'Segmentation Platform', 'Subresource Filter', 'TpcdMetadata',
      'TrustTokenKeyCommitments', 'WasmTtsEngine', 'WidevineCdm',
      'ZxcvbnData', 'Crowd Deny', 'PrivacySandboxAttestationsPreloaded',
      'SSLErrorAssistant', 'AutofillStates',
    ]);

    fs.cpSync(srcProfile, tmpDir, {
      recursive: true,
      filter: (src) => {
        const name = path.basename(src);
        // 跳过缓存和临时文件
        if (name.endsWith('.tmp') || name.endsWith('.log')) return false;
        if (skipDirs.has(name)) return false;
        return true;
      },
    });
    console.log('  配置文件复制完成');

    // 启动 Chrome（用复制的 profile）
    chromeProcess = spawn(CHROME_EXE, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      URL,
    ], {
      stdio: 'ignore',
      detached: false,
    });

    console.log(`  Chrome 已启动 (PID: ${chromeProcess.pid})`);

    // 等待 CDP 就绪
    console.log('  等待 CDP 端口就绪...');
    let cdpReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const resp = await fetch(`http://localhost:${CDP_PORT}/json/version`);
        if (resp.ok) {
          cdpReady = true;
          break;
        }
      } catch {}
      await sleep(1000);
    }

    if (!cdpReady) {
      throw new Error('CDP 端口未就绪');
    }
    console.log('  CDP 已就绪');

    // ========== 连接 Playwright ==========
    console.log('正在连接 Playwright 到 Chrome...');
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    await sleep(3000);

    // 检查是否登录
    const isLoginPage = await page.locator('input[placeholder*="帐户"], input[placeholder*="邮箱"]').count();
    if (isLoginPage > 0) {
      console.log('需要登录！请在弹出的浏览器窗口中手动登录...');
      try {
        await page.waitForURL(url => url.includes('budget_view') || url.includes('BudgetView'), { timeout: 120000 });
        await sleep(3000);
        console.log('登录完成');
      } catch {
        console.log('登录超时，继续...');
      }
    }

    // ========== 探索页面 ==========
    console.log('[2/6] 分析页面结构...');
    const structure = await page.evaluate(() => {
      const info = [];
      document.querySelectorAll('.ant-form-item, .ant-row').forEach(row => {
        const label = row.querySelector('.ant-form-item-label label, label')?.textContent?.trim();
        if (!label) return;
        const select = row.querySelector('.ant-select-selector, .ant-cascader-picker, .ant-picker, input');
        if (select) {
          const rect = select.getBoundingClientRect();
          info.push({ label, type: select.className.split(' ')[0] });
        }
      });
      return info;
    });
    console.log('表单项:', structure.map(s => `[${s.label}]`).join(', '));

    // ========== 步骤3：年份 ==========
    console.log('[3/6] 选择年份: ' + YEAR);
    const yearRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=年份') }).first();
    if (await yearRow.count() > 0) {
      await yearRow.locator('.ant-select-selector, .ant-picker').first().click().catch(() => {});
      await sleep(1500);
    }
    await page.locator('.ant-select-item:has-text("2026"), .ant-picker-cell:has-text("2026"), li:has-text("2026")').first().click().catch(() => {});
    await sleep(1000);
    console.log('  已选: ' + YEAR);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step1.png'), fullPage: true });

    // ========== 步骤4：预算组织 ==========
    console.log('[4/6] 选择预算组织...');
    const orgRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=预算组织') }).first();
    if (await orgRow.count() > 0) {
      await orgRow.locator('.ant-select-selector, .ant-cascader-picker').first().click().catch(() => {});
      await sleep(1500);
    }
    await page.locator('.ant-select-dropdown:visible, .ant-cascader-menus:visible').first().waitFor({ timeout: 5000 }).catch(() => {});

    for (const code of ORG_CODES) {
      console.log(`  选择: ${code}`);
      const si = page.locator('.ant-select-dropdown input, .ant-cascader-menus input').first();
      if (await si.count() > 0) {
        await si.fill(code);
        await sleep(1200);
      }
      const opt = page.locator(`.ant-select-item:has-text("${code}"), .ant-cascader-menu-item:has-text("${code}")`).first();
      if (await opt.count() > 0) {
        await opt.click();
        await sleep(500);
        console.log('    ✓');
      } else {
        console.log('    ✗ 跳过');
      }
    }
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await sleep(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step2.png'), fullPage: true });

    // ========== 步骤5：预算科目 ==========
    console.log('[5/6] 选择预算科目: ' + BUDGET_ITEM_KEYWORD);
    const itemRow = page.locator('.ant-form-item, .ant-row').filter({ has: page.locator('text=预算科目') }).first();
    if (await itemRow.count() > 0) {
      await itemRow.locator('.ant-select-selector, .ant-cascader-picker').first().click().catch(() => {});
      await sleep(1500);
    }
    await page.locator('.ant-select-dropdown:visible, .ant-cascader-menus:visible').first().waitFor({ timeout: 5000 }).catch(() => {});
    const si2 = page.locator('.ant-select-dropdown input').first();
    if (await si2.count() > 0) {
      await si2.fill(BUDGET_ITEM_KEYWORD);
      await sleep(1000);
    }
    await page.locator(`.ant-select-item:has-text("${BUDGET_ITEM_KEYWORD}")`).first().click().catch(() => {});
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await sleep(1000);
    console.log('  已选: ' + BUDGET_ITEM_KEYWORD);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_step3.png'), fullPage: true });

    // ========== 步骤6：查询 ==========
    console.log('[6/6] 查询数据...');
    const queryBtn = page.locator('button:has-text("查询"), button:has-text("搜索"), button:has-text("Query")').first();
    if (await queryBtn.count() > 0) {
      await queryBtn.click();
      console.log('  等待数据加载...');
      await sleep(6000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(2000);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
    console.log('\n✅ 截图已保存: reports/budget_result.png');
    console.log('浏览器保持30秒供查看...');
    await sleep(30000);

  } catch (err) {
    console.error('错误:', err.message);
  } finally {
    if (chromeProcess) {
      console.log('关闭 Chrome...');
      chromeProcess.kill();
    }
    console.log('完成');
  }
})();
