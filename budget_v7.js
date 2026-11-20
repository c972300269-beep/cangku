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

  console.log('启动...');
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

  // Year
  console.log('[1] 年份');
  await page.locator('.el-form-item').filter({ hasText: '年份' }).locator('input').first().click();
  await sleep(1500);
  await page.locator('.el-year-table td .cell:has-text("2026")').first().click().catch(() => {});
  await sleep(1000);
  console.log('✓');

  // ===== Org: Click search icon to open dialog =====
  console.log('\n[2] 预算组织 - 点击搜索图标');
  // The search icon is .el-icon-search inside the org form-item
  const searchIcon = page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('.el-icon-search').first();
  console.log('搜索图标count:', await searchIcon.count());
  
  if (await searchIcon.count() > 0) {
    await searchIcon.click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(3000);
  } else {
    await page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('.el-input__suffix').first().click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(3000);
  }

  // Check dialog state
  let dialogState = await page.evaluate(() => {
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (!dlg) return { found: false };
    return {
      found: true,
      visible: dlg.style.display !== 'none',
      class: dlg.className,
    };
  });
  console.log('Dialog状态:', dialogState);

  if (!dialogState.visible) {
    // Try clicking the autocomplete to trigger suggestions
    console.log('尝试点击autocomplete...');
    await page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('.el-autocomplete').first().click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(3000);
    
    dialogState = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      return dlg ? { visible: dlg.style.display !== 'none' } : { found: false };
    });
    console.log('Dialog状态2:', dialogState);
  }

  if (!dialogState.visible) {
    // Try double-clicking the input
    console.log('双击input...');
    await page.locator('.el-form-item').filter({ hasText: '预算组织' }).locator('input').first().dblclick({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(3000);
    
    dialogState = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      return dlg ? { visible: dlg.style.display !== 'none' } : { found: false };
    });
    console.log('Dialog状态3:', dialogState);
  }

  if (dialogState.visible) {
    // Dialog is open! Now find and interact with content
    console.log('✓ 对话框已打开!');
    
    const dlgContent = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      if (!dlg) return {};
      
      const title = dlg.querySelector('.el-dialog__title');
      const body = dlg.querySelector('.el-dialog__body');
      const footer = dlg.querySelector('.el-dialog__footer');
      
      return {
        title: title ? title.textContent.trim() : '',
        bodyHTML: body ? body.outerHTML.substring(0, 3000) : '',
        bodyInputs: body ? Array.from(body.querySelectorAll('input')).map(i => ({
          type: i.type, placeholder: i.placeholder, class: typeof i.className === 'string' ? i.className.substring(0, 40) : ''
        })) : [],
        treeNodes: body ? Array.from(body.querySelectorAll('.el-tree-node__label')).slice(0, 20).map(l => l.textContent.trim()) : [],
        buttons: footer ? Array.from(footer.querySelectorAll('button')).map(b => b.textContent.trim()) : [],
        allButtons: Array.from(dlg.querySelectorAll('button')).map(b => b.textContent.trim()),
      };
    });
    
    console.log('Dialog内容:', JSON.stringify(dlgContent, null, 2));
    
    // Try to search and select orgs
    const searchInput = page.locator('.el-dialog__wrapper.h-pro-ref-tree input[type="text"]').first();
    console.log('Dialog搜索input count:', await searchInput.count());
    
    if (await searchInput.count() > 0) {
      for (const code of ORG_CODES) {
        await searchInput.click();
        await searchInput.fill('');
        await sleep(200);
        await searchInput.fill(code);
        await sleep(2000);
        
        // Look for tree nodes
        const node = page.locator(`.el-dialog__wrapper .el-tree-node__label:has-text("${code}")`).first();
        if (await node.count() > 0 && await node.isVisible()) {
          // Click checkbox
          const cb = page.locator(`.el-dialog__wrapper .el-tree-node:has-text("${code}") .el-checkbox__input`).first();
          if (await cb.count() > 0) {
            await cb.click();
            console.log(`  ✓ ${code}`);
          } else {
            await node.click();
            console.log(`  ✓ ${code} (clicked label)`);
          }
        } else {
          console.log(`  ✗ ${code} 未找到`);
        }
        await sleep(300);
      }
    }
    
    // Click确定
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_dialog_open.png'), fullPage: true });
    
    const okBtn = page.locator('.el-dialog__wrapper button:has-text("确定")').first();
    if (await okBtn.count() > 0 && await okBtn.isVisible()) {
      await okBtn.click();
      await sleep(1000);
      console.log('  已点确定');
    }
  } else {
    console.log('✗ 无法打开对话框');
  }

  // ===== Budget Item =====
  console.log('\n[3] 预算科目');
  const itemIcon = page.locator('.el-form-item').filter({ hasText: '预算科目' }).locator('.el-icon-search').first();
  if (await itemIcon.count() > 0) {
    await itemIcon.click();
    await sleep(3000);
    
    // Check cascader dialog
    const cascDlg = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper:not(.h-pro-ref-tree):not([style*="display: none"])');
      if (!dlg) return { found: false };
      const title = dlg.querySelector('.el-dialog__title');
      const body = dlg.querySelector('.el-dialog__body');
      return {
        found: true,
        title: title ? title.textContent.trim() : '',
        bodyText: body ? body.textContent.trim().substring(0, 500) : '',
        inputs: body ? Array.from(body.querySelectorAll('input')).map(i => i.placeholder) : [],
        buttons: Array.from(dlg.querySelectorAll('button')).map(b => b.textContent.trim()),
      };
    });
    console.log('科目Dialog:', JSON.stringify(cascDlg, null, 2));
    
    // Try search
    const si = page.locator('.el-dialog__wrapper:not([style*="display: none"]) input[type="text"]').first();
    if (await si.count() > 0) {
      await si.fill('13403');
      await sleep(1500);
    }
    
    const match = page.locator('.el-dialog__wrapper:not([style*="display: none"]) li:has-text("13403"), .el-tree-node__label:has-text("13403")').first();
    if (await match.count() > 0) {
      await match.click();
      console.log('  ✓ 13403');
    }
    
    const okBtn2 = page.locator('.el-dialog__wrapper:not([style*="display: none"]) button:has-text("确定")').first();
    if (await okBtn2.count() > 0) {
      await okBtn2.click();
      await sleep(500);
    }
  }
  console.log('完成');

  // ===== Query =====
  console.log('\n[4] 查询');
  await page.locator('button:has-text("查询")').first().click();
  console.log('已点击');
  await sleep(10000);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(3000);

  const rows = await page.locator('.el-table__body tr').count();
  const empty = await page.locator('.el-table__empty-text').count();
  console.log(`表格行数: ${rows}, 空: ${empty > 0}`);

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\n✅ budget_result.png');

  // If data, print summary
  if (rows > 0) {
    const preview = await page.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__body tr');
      return Array.from(rows).slice(0, 5).map(r => {
        const cells = r.querySelectorAll('td');
        return Array.from(cells).map(c => c.textContent.trim().substring(0, 40));
      });
    });
    console.log('数据预览:', JSON.stringify(preview));
  }

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
