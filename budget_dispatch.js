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

  // ===== Use dispatchEvent to open org dialog =====
  console.log('\n[2] 预算组织 - dispatchEvent');

  const opened = await page.evaluate(() => {
    // Find the search icon in the org form-item
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (!orgItem) return { ok: false, msg: 'no org item' };
    
    const icon = orgItem.querySelector('.el-icon-search');
    if (!icon) return { ok: false, msg: 'no search icon' };
    
    // Dispatch a full mouse event sequence
    icon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    icon.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    
    // Check if dialog opened
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    return { 
      ok: true, 
      dialogVisible: dlg ? dlg.style.display !== 'none' : false 
    };
  });
  
  console.log('dispatchEvent结果:', opened);
  await sleep(2000);

  // Try focusing input first, then clicking
  if (!opened.dialogVisible) {
    console.log('尝试focus+click...');
    const result2 = await page.evaluate(() => {
      const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
      if (!orgItem) return { ok: false };
      
      const input = orgItem.querySelector('input');
      const icon = orgItem.querySelector('.el-icon-search');
      
      if (input && icon) {
        input.focus();
        setTimeout(() => {
          icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }, 100);
      }
      
      return { ok: true };
    });
    await sleep(3000);
    
    const dlgVis = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      return dlg ? dlg.style.display !== 'none' : false;
    });
    console.log('focus+click后 dialog:', dlgVis);
  }

  // Try clicking the input suffix (the parent of the icon)
  let dlgVis2 = await page.evaluate(() => {
    const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    return dlg ? dlg.style.display !== 'none' : false;
  });
  
  if (!dlgVis2) {
    console.log('尝试点击suffix...');
    await page.evaluate(() => {
      const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
      if (!orgItem) return;
      const suffix = orgItem.querySelector('.el-input__suffix');
      if (suffix) {
        suffix.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
    });
    await sleep(2000);
    
    dlgVis2 = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      return dlg ? dlg.style.display !== 'none' : false;
    });
    console.log('suffix后 dialog:', dlgVis2);
  }

  // Try mousedown on the whole ref control
  if (!dlgVis2) {
    console.log('尝试点击ref control...');
    await page.evaluate(() => {
      const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
      if (!orgItem) return;
      const ref = orgItem.querySelector('.h-pro-edit-control--ref');
      if (ref) {
        ref.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        ref.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        ref.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
    });
    await sleep(2000);
    
    dlgVis2 = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
      return dlg ? dlg.style.display !== 'none' : false;
    });
    console.log('ref control后 dialog:', dlgVis2);
  }

  // Final check and screenshot
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_result.png'), fullPage: true });
  console.log('\nbudget_result.png');

  if (dlgVis2) {
    console.log('✓ 对话框已打开!');
    // Now interact with the dialog...
  } else {
    console.log('✗ 所有方法都无法打开对话框');
    // Try Vue approach as last resort
    console.log('\n尝试Vue方法...');
    const vueResult = await page.evaluate(() => {
      const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
      if (!orgItem) return { ok: false, msg: 'no org item' };
      
      // Find Vue component
      let el = orgItem.querySelector('.h-pro-edit-control--ref');
      if (!el) el = orgItem.querySelector('.el-autocomplete');
      if (!el) return { ok: false, msg: 'no component' };
      
      // Try __vue__
      const vm = el.__vue__;
      if (vm) {
        const methods = vm.$options && vm.$options.methods ? Object.keys(vm.$options.methods) : [];
        const data = vm.$data ? Object.keys(vm.$data) : [];
        return { ok: true, hasVm: true, methods: methods.slice(0, 20), dataKeys: data.slice(0, 20) };
      }
      
      return { ok: true, hasVm: false };
    });
    console.log('Vue组件:', JSON.stringify(vueResult, null, 2));
  }

  await context.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
