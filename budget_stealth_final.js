const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const vanillaPuppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const CHROMIUM_PATH = 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const OUT = 'E:/workbuddy/Claw/reports';
const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';
const ACCOUNT = '13403';
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await vanillaPuppeteer.launch({
    headless: false,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Login
    console.log('[1] 登录...');
    await page.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(5000);
    console.log('  标题:', await page.title());

    await page.waitForSelector('input', { timeout: 10000 });
    await wait(2000);
    
    const inputs = await page.$$('input');
    // Find text and password inputs
    let userInput, pwInput;
    for (const inp of inputs) {
      const type = await page.evaluate(el => el.type, inp);
      if (type === 'text' || !type) userInput = inp;
      if (type === 'password') pwInput = inp;
    }
    if (userInput && pwInput) {
      await userInput.type('chenjialin3');
      await pwInput.type('chenjialin');
      console.log('  ✓ 填写凭据');
    }

    // Click login button
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.includes('登录')) { b.click(); return; }
      }
    });
    await wait(8000);
    console.log('  登录后:', await page.title());

    // Go to budget page
    console.log('[2] 进入预算...');
    await page.goto('https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail', {
      waitUntil: 'networkidle2', timeout: 60000
    });
    await wait(10000);
    console.log('  标题:', await page.title());

    // Select year - use evaluate for everything
    console.log('[3] 选择年份2026...');
    await page.evaluate(() => {
      const yearInput = document.querySelector('.h-pro-form-item--year input');
      if (yearInput) yearInput.click();
    });
    await wait(1500);
    await page.evaluate(() => {
      const cells = document.querySelectorAll('.el-year-table td .cell');
      for (const c of cells) {
        if (c.textContent.trim() === '2026') { c.click(); return; }
      }
    });
    await wait(1500);
    console.log('  ✓');

    // Select orgs
    console.log('[4] 选择预算组织...');
    await page.evaluate(() => {
      // Find the budget org search icon
      const items = document.querySelectorAll('.el-form-item, .h-pro-form-item');
      for (const item of items) {
        if (item.textContent.includes('预算组织')) {
          const icon = item.querySelector('.el-icon-search');
          if (icon) { icon.click(); return; }
        }
      }
    });
    await wait(4000);
    
    // Wait for tree and select orgs
    await page.waitForSelector('.el-tree-node__content', { timeout: 20000 }).catch(() => {});
    await wait(2000);
    
    const orgCodes = ORGS.split(',');
    for (const code of orgCodes) {
      await page.evaluate((code) => {
        const nodes = document.querySelectorAll('.el-tree-node__content');
        for (const n of nodes) {
          if (n.textContent.includes(code)) {
            const cb = n.querySelector('.el-checkbox__input');
            if (cb) { cb.click(); return; }
          }
        }
      }, code);
      console.log('  ' + code + ': ✓');
    }

    // Confirm org dialog - DON'T press Escape!
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '确 定') { b.click(); return; }
      }
    });
    await wait(3000); // Wait longer for dialog to close

    // Select subject
    console.log('[5] 选择预算科目...');
    await page.evaluate(() => {
      const items = document.querySelectorAll('.el-form-item, .h-pro-form-item');
      for (const item of items) {
        if (item.textContent.includes('预算科目')) {
          const icon = item.querySelector('.el-icon-search');
          if (icon) { icon.click(); return; }
        }
      }
    });
    await wait(4000);
    
    await page.waitForSelector('.el-tree-node__content', { timeout: 20000 }).catch(() => {});
    await wait(2000);
    
    // Search and select subject
    await page.evaluate((acc) => {
      // Type search
      const searchInput = document.querySelector('input[placeholder*="关键字"]');
      if (searchInput) { searchInput.value = acc; searchInput.dispatchEvent(new Event('input', {bubbles: true})); }
    }, ACCOUNT);
    await wait(500);
    
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.title === '查询' || (b.textContent.includes('查询') && b.closest('.el-dialog__wrapper'))) {
          b.click(); return;
        }
      }
    });
    await wait(3000);

    await page.evaluate((acc) => {
      const nodes = document.querySelectorAll('.el-tree-node__content');
      for (const n of nodes) {
        if (n.textContent.includes(acc)) {
          const cb = n.querySelector('.el-checkbox__input');
          if (cb) { cb.click(); return; }
        }
      }
    }, ACCOUNT);
    console.log('  ' + ACCOUNT + ': ✓');

    // Confirm subject dialog
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '确 定') { b.click(); return; }
      }
    });
    await wait(3000);

    // Set Vue model values directly
    console.log('[6] 设置Vue模型值...');
    const setResult = await page.evaluate((orgsStr) => {
      const form = document.querySelector('.el-form');
      if (!form?.__vue__) return 'no form';
      
      let vm = form.__vue__;
      while (vm) {
        if (vm.model && vm.model.year !== undefined) {
          vm.$set(vm.model, 'year', '2026');
          vm.$set(vm.model, 'period', '2026');
          vm.$set(vm.model, 'budgetOrg', { id: orgsStr, code: orgsStr, name: null });
          vm.$set(vm.model, 'budgetOrg.id', orgsStr);
          vm.$set(vm.model, 'budgetAccount', { id: '13403', code: '13403', name: null });
          vm.$set(vm.model, 'budgetAccount.id', '13403');
          return 'OK: year=' + vm.model.year + ' period=' + vm.model.period + ' org=' + JSON.stringify(vm.model.budgetOrg);
        }
        vm = vm.$parent;
      }
      return 'model not found';
    }, ORGS);
    console.log('  ' + setResult);

    // Get auth token 
    console.log('[7] 获取认证token...');
    const authInfo = await page.evaluate(() => {
      // Check localStorage for token
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        keys.push(localStorage.key(i));
      }
      
      // Check for pro__Access-Token specifically
      const raw = localStorage.getItem('pro__Access-Token');
      let tokenValue = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          tokenValue = parsed.value || parsed.access_token || parsed.token;
        } catch {
          tokenValue = raw;
        }
      }
      
      // Also check pro__Token-Expire for format hints
      const expireRaw = localStorage.getItem('pro__Token-Expire');
      
      return { 
        lsKeys: keys,
        tokenRaw: raw ? raw.substring(0, 100) : null,
        tokenValue: tokenValue,
        expireRaw: expireRaw,
      };
    });
    console.log('  LS keys:', authInfo.lsKeys.join(', '));
    console.log('  Token value:', authInfo.tokenValue);

    if (!authInfo.tokenValue) {
      console.log('  ❌ 无有效token');
      return;
    }

    // Try API with the extracted token + multiple header formats
    console.log('[8] 带token的API调用...');
    
    const headersToTry = [
      { 'Authorization': 'Bearer ' + authInfo.tokenValue },
      { 'Authorization': 'bearer ' + authInfo.tokenValue },
      { 'Access-Token': authInfo.tokenValue },
      { 'X-Access-Token': authInfo.tokenValue },
      {},  // no auth header - rely on cookies
    ];
    
    let apiSuccess = false;
    for (const headers of headersToTry) {
      const result = await page.evaluate(async (params) => {
        const { orgIds, headers } = params;
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
          xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
          Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
          xhr.onload = () => {
            const data = JSON.parse(xhr.responseText);
            const rows = data.list || data.rows || data.data || data.records || [];
            resolve({
              status: xhr.status,
              success: data.success !== false,
              total: data.total || rows.length,
              rowCount: rows.length,
              keys: rows.length > 0 ? Object.keys(rows[0]).slice(0, 10) : [],
            });
          };
          xhr.onerror = () => resolve({ error: 'xhr failed' });
          xhr.send(JSON.stringify({
            Q_main: {
              PERIOD_S_EQ: 2026,
              ORG_ID_S_IN: orgIds,
              ACCOUNT_ID_S_EQ: '13403',
            },
            page: 0,
            size: 500,
          }));
        });
      }, { orgIds: ORGS, headers });
      
      console.log('  Headers ' + JSON.stringify(Object.keys(headers)) + ': status=' + result.status + ' rows=' + result.rowCount);
      
      if (result.status === 200 && result.rowCount > 0) {
        console.log('  ✓ 成功! 列: ' + result.keys.join(', '));
        apiSuccess = true;
        
        // Get full data
        const fullData = await page.evaluate((params) => {
          const { orgIds, headers } = params;
          return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
            xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
            Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => resolve('{}');
            xhr.send(JSON.stringify({
              Q_main: {
                PERIOD_S_EQ: 2026,
                ORG_ID_S_IN: orgIds,
                ACCOUNT_ID_S_EQ: '13403',
              },
              page: 0,
              size: 500,
            }));
          });
        }, { orgIds: ORGS, headers });
        
        const jp = path.join(OUT, 'budget_live_data.json');
        fs.writeFileSync(jp, fullData);
        
        const data = JSON.parse(fullData);
        const rows = data.list || data.rows || data.data || data.records || [];
        
        let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算</title>';
        html += '<style>body{font:Arial;margin:15px}table{border-collapse:collapse;font-size:12px}';
        html += 'th,td{border:1px solid #ddd;padding:5px;text-align:right}th{background:#4472C4;color:#fff}';
        html += 'td:first-child,td:nth-child(2){text-align:left}</style></head><body>';
        html += '<h1>2026年预算 - 科目13403</h1><p>' + rows.length + '行</p><table><thead><tr>';
        for (const h of result.keys) html += '<th>' + h + '</th>';
        html += '</tr></thead><tbody>';
        for (const row of rows) {
          html += '<tr>';
          for (const h of result.keys) html += '<td>' + (row[h] || '') + '</td>';
          html += '</tr>';
        }
        html += '</tbody></table></body></html>';
        
        const hp = path.join(OUT, 'budget_live_report.html');
        fs.writeFileSync(hp, html);
        console.log('\n✓ 报告已生成!');
        console.log('  HTML: ' + hp);
        console.log('  JSON: ' + jp);
        console.log('  共 ' + rows.length + ' 行');
        break;
      }
    }
    
    console.log('  Status:', apiResult.status);
    if (apiResult.rowCount) {
      console.log('  ✓ 总记录: ' + apiResult.total + ', 返回: ' + apiResult.rowCount + ' 行');
      console.log('  列: ' + apiResult.keys.join(', '));
      console.log('  示例: ' + apiResult.sample);
    } else {
      console.log('  预览: ' + (apiResult.preview || apiResult.error || 'empty'));
    }
    if (apiResult.status === 200 && apiResult.rowCount > 0) {
      // Get full data
      console.log('[8] 获取完整数据...');
      const fullData = await page.evaluate(async (orgIds) => {
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
          xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
          xhr.onload = () => resolve(xhr.responseText);
          xhr.onerror = () => resolve('{}');
          xhr.send(JSON.stringify({
            Q_main: {
              PERIOD_S_EQ: 2026,
              ORG_ID_S_IN: orgIds,
              ACCOUNT_ID_S_EQ: '13403',
            },
            page: 0,
            size: 500,
          }));
        });
      }, ORGS);

      // Save JSON
      const jp = path.join(OUT, 'budget_live_data.json');
      fs.writeFileSync(jp, fullData);
      console.log('  ✓ JSON: ' + jp + ' (' + fullData.length + ' bytes)');

      // Parse and generate report
      try {
        const data = JSON.parse(fullData);
        const rows = data.list || data.rows || data.data || data.records || [];
        
        if (rows.length > 0) {
          const headers = Object.keys(rows[0]);
          console.log('  列: ' + headers.join(', '));
          
          // Generate HTML
          let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>2026年预算报告</title>';
          html += '<style>body{font-family:Arial;margin:15px;background:#f5f5f5}';
          html += 'h1{color:#333}.summary{background:#fff;padding:10px 15px;border-radius:4px}';
          html += 'table{border-collapse:collapse;font-size:12px;width:100%;background:#fff}';
          html += 'th,td{border:1px solid #ddd;padding:5px 7px;text-align:right;white-space:nowrap}';
          html += 'th{background:#4472C4;color:#fff;position:sticky;top:0}';
          html += 'td:first-child,td:nth-child(2){text-align:left}';
          html += 'tr:nth-child(even){background:#fafafa}</style></head><body>';
          html += '<h1>2026年预算数据报告</h1>';
          html += '<div class="summary"><strong>科目: 13403-设备设施维护支出</strong> | 年份:2026 | 4个组织 | ' + rows.length + '行</div>';
          html += '<table><thead><tr>';
          for (const h of headers) html += '<th>' + h + '</th>';
          html += '</tr></thead><tbody>';
          for (const row of rows) {
            html += '<tr>';
            for (const h of headers) html += '<td>' + (row[h] !== null ? row[h] : '') + '</td>';
            html += '</tr>';
          }
          html += '</tbody></table></body></html>';
          
          const hp = path.join(OUT, 'budget_live_report.html');
          fs.writeFileSync(hp, html);
          
          console.log('\n✓ 成功!');
          console.log('  HTML: ' + hp);
          console.log('  JSON: ' + jp);
          console.log('  共 ' + rows.length + ' 行');
        }
      } catch (e) {
        console.log('  JSON解析错误: ' + e.message);
        console.log('  原始数据: ' + fullData.substring(0, 300));
      }
    } else {
      console.log('  ⚠ 无数据');
      // Try with different params
      console.log('  尝试不同参数...');
      const altResult = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/api-budget/budget/view/detail/list', true);
          xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
          xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText.substring(0, 500) });
          xhr.onerror = () => resolve({ error: 'failed' });
          xhr.send(JSON.stringify({ Q_main: { PERIOD_S_EQ: 2026 }, page: 0, size: 10 }));
        });
      });
      console.log('  仅年份2026: ' + altResult.status + ' ' + altResult.text);
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
    console.log('Done');
  }
})();
