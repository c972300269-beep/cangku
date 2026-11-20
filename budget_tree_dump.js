const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TMP_PROFILE = 'E:/workbuddy/Claw/.workbuddy/tmp/budget_tree';
const SRC_PROFILE = 'C:/Users/chenjialin3/AppData/Local/Google/Chrome/User Data';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
  await sleep(2000);
  if (fs.existsSync(TMP_PROFILE)) fs.rmSync(TMP_PROFILE, { recursive: true, force: true });
  const d = TMP_PROFILE + '/Default'; fs.mkdirSync(d, { recursive: true });
  const s = SRC_PROFILE + '/Default';
  for (const f of ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal', 'Preferences'])
    try { if (fs.existsSync(s + '/' + f)) fs.copyFileSync(s + '/' + f, d + '/' + f); } catch {}
  for (const dir of ['Local Storage', 'Network', 'Session Storage'])
    try { if (fs.existsSync(s + '/' + dir)) fs.cpSync(s + '/' + dir, d + '/' + dir, { recursive: true }); } catch {}
  try { if (fs.existsSync(SRC_PROFILE + '/Local State')) fs.copyFileSync(SRC_PROFILE + '/Local State', TMP_PROFILE + '/Local State'); } catch {}
  fs.writeFileSync(TMP_PROFILE + '/First Run', '');

  const ctx = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true, channel: 'chrome',
    args: ['--no-first-run'],
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  if (await page.locator('button:has-text("自动登录")').count() > 0) {
    await page.locator('button:has-text("自动登录")').click(); await sleep(8000);
  }
  for (let i = 0; i < 20 && !page.url().includes('BudgetView'); i++) await sleep(2000);
  await page.waitForSelector('.el-loading-mask', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await sleep(5000);

  // Call showRef to load data, then force dialog visible, then dump tree HTML
  const result = await page.evaluate(async () => {
    const orgItem = Array.from(document.querySelectorAll('.el-form-item')).find(el => el.textContent.includes('预算组织'));
    if (!orgItem) return { error: 'no org item' };
    const ref = orgItem.querySelector('.h-pro-edit-control--ref');
    if (!ref?.__vue__) return { error: 'no ref vue' };
    
    // Call showRef to trigger API
    ref.__vue__.showRef();
    
    // Wait for API response
    await new Promise(r => setTimeout(r, 3000));
    
    // Force dialog visible
    ref.__vue__.refVisible = true;
    await new Promise(r => setTimeout(r, 1000));
    
    const wrapper = document.querySelector('.el-dialog__wrapper.h-pro-ref-tree');
    if (wrapper) {
      wrapper.style.display = '';
      wrapper.style.visibility = 'visible';
      wrapper.style.opacity = '1';
    }
    await new Promise(r => setTimeout(r, 500));
    
    // NOW dump tree nodes in detail
    const nodes = document.querySelectorAll('.el-tree-node');
    const nodeDetails = Array.from(nodes).slice(0, 10).map(n => {
      const label = n.querySelector('.el-tree-node__label');
      const content = n.querySelector('.el-tree-node__content');
      return {
        textContent: label?.textContent,
        innerText: label?.innerText,
        innerHTML: label?.innerHTML?.substring(0, 200),
        outerHTML: n.outerHTML.substring(0, 500),
        hasChildren: n.classList.contains('is-expanded'),
        className: n.className,
        // Check Vue data
        vueDataKeys: n.__vue__ ? Object.keys(n.__vue__.$data || {}) : [],
        vueData: n.__vue__ ? Object.keys(n.__vue__.$data || {}).slice(0, 10) : 'no vue',
      };
    });
    
    // Dump the ref component's full state
    const refData = {
      refVisible: ref.__vue__.refVisible,
      refInputValue: ref.__vue__.refInputValue,
      allDataKeys: Object.keys(ref.__vue__.$data || {}),
      allMethods: ref.__vue__.$options?.methods ? Object.keys(ref.__vue__.$options.methods).filter(k => k.includes('Ref') || k.includes('Tree') || k.includes('Node')) : [],
    };
    
    // Also check if there's an el-input text inside dialog for search
    const dialogInput = wrapper?.querySelector('input[type="text"]');
    
    return {
      nodeCount: nodes.length,
      nodeDetails,
      refData,
      dialogInputExists: !!dialogInput,
      wrapperDisplay: wrapper?.style.display,
      bodyText: wrapper?.textContent?.trim()?.substring(0, 500),
    };
  });
  
  console.log(JSON.stringify(result, null, 2));
  await ctx.close();
})().catch(async err => {
  console.error('错误:', err.message);
  try { execSync('taskkill /f /im chrome.exe /t 2>nul', { stdio: 'ignore' }); } catch {}
});
