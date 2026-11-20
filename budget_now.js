const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(require('puppeteer-core'));
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();

  console.log('[1] 登录...');
  await page.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await page.type('input[placeholder*="帐户名"]', 'chenjialin3');
  await page.type('input[placeholder*="密码"]', 'chenjialin');
  await sleep(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='登录'); if (b) b.click(); });
  await sleep(6000);
  console.log('  URL:', page.url());
  if (!page.url().includes('/eacp/') && !page.url().includes('/home')) { 
    console.log('  Login failed!'); await browser.close(); return; 
  }

  // Dump localStorage
  const ls = await page.evaluate(() => {
    const all = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      all[k] = (v || '').substring(0, 120);
    }
    return all;
  });
  console.log('[2] localStorage:', Object.keys(ls).join(', '));
  for (const [k, v] of Object.entries(ls)) console.log('   ', k.substring(0, 30), '=', v.substring(0, 80));

  // Get token
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), v = localStorage.getItem(k);
      if (!k || !v) continue;
      try { const o = JSON.parse(v); if (o.access_token) return o.access_token; if (o.value && k.toLowerCase().includes('token')) return o.value; if (o.token) return o.token; } catch {}
      if (k.toLowerCase().includes('token')) return v;
    }
    return null;
  });

  console.log('[3] 调API...');
  let res;
  
  // Try multiple API formats
  // Find the org API
  console.log('  Testing org APIs...');
  const orgTests = [
    '/api/api-budget/budgetOrg/listByUser',
    '/api/api-budget/org/listByUser',
    '/api/budget/org/listByUser',
    '/api/budgetOrg/listByUser',
  ];
  for (const u of orgTests) {
    const r = await page.evaluate(async ({ t, url }) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+t }, body:'{}' });
      return { status: res.status, text: (await res.text()).substring(0, 200) };
    }, { t: token, url: u });
    console.log(`   ${u.split('/').pop()}: ${r.status} ${r.text.replace(/\n/g,' ')}`);
    if (r.status === 200) {
      // Parse orgs and use them
      try {
        const data = JSON.parse(r.text);
        if (data.success || data.length > 0 || data.data) {
          const orgs = data.data || data.list || data || [];
          if (Array.isArray(orgs) && orgs.length > 0) {
            const ids = orgs.map(o => o.id || o.orgId || o.code).filter(Boolean).join(',');
            console.log(`   Found ${orgs.length} orgs, IDs: ${ids}`);
          }
        }
      } catch(e) {}
    }
  }

  // Direct org IDs - use them as a header or filter
  console.log('  Trying detail with org set...');
  const ORGS = 'GZ1-3001QYQCP008,GZ1-3001QYQCP009,GZ1-3001QYQCP036,QY1-3003QYP002';
  
  // Try with org as request param
  const attempts = [
    { name: 'POST with org', body: { org: ORGS, PERIOD_S_EQ: '2026', page: 0, size: 500 } },
    { name: 'POST with budgetOrgIds', body: { budgetOrgIds: ORGS.split(','), PERIOD_S_EQ: '2026', page: 0, size: 500 } },
    { name: 'POST Q_main org+info', body: { orgInfo: { ids: ORGS }, Q_main: { PERIOD_S_EQ: '2026' }, page: 0, size: 500 } },
  ];

  for (const a of attempts) {
    res = await page.evaluate(async ({ t, body }) => {
      const r = await fetch('/api/api-budget/budget/view/detail/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: JSON.stringify(body)
      });
      return { status: r.status, text: await r.text() };
    }, { t: token, body: a.body });
    const ok = !res.text.includes('主键不可为空');
    console.log(`  ${a.name}: ${ok ? '✓' : '✗'} ${ok ? res.text.substring(0, 100).replace(/\n/g,' ') : 'same error'}`);
    if (ok) break;
  }

  for (const a of attempts) {
    res = await page.evaluate(async ({ t, a }) => {
      const opts = { method: a.method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t } };
      if (a.body) opts.body = JSON.stringify(a.body);
      const r = await fetch(a.url, opts);
      return { status: r.status, text: await r.text() };
    }, { t: token, a });
    const ok = res.text.includes('"success":true') || res.text.includes('"code":200') || (res.text.startsWith('[') || res.text.startsWith('{"list"') || res.text.startsWith('{"data"'));
    console.log(`  ${a.name}: ${res.status} ${ok ? 'OK' : res.text.substring(0, 100).replace(/\n/g,' ')}`);
    if (ok) break;
  }

  for (const a of attempts) {
    res = await page.evaluate(async ({ t, body }) => {
      const r = await fetch('/api/api-budget/budget/view/detail/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: JSON.stringify(body)
      });
      return { status: r.status, text: await r.text() };
    }, { t: token, body: a.body });
    const ok = res.text.includes('"success":true') || res.text.includes('"code":200');
    console.log(`  ${a.name}: ${res.status} ${ok ? 'OK' : res.text.substring(0, 100).replace(/\n/g,' ')}`);
    if (ok) break;
  }

  console.log('  Status:', res.status, 'Len:', res.text.length);
  
  try {
    const data = JSON.parse(res.text);
    const rows = data.list || data.data || data.rows || data.records || [];
    
    if (data.success === false && rows.length === 0) {
      console.log('  API Error:', (data.message||data.errorMessage||'').substring(0, 200));
      console.log('  Full:', JSON.stringify(data).substring(0, 500));
      await browser.close(); return;
    }

    // Filter 13403
    const filtered = rows.filter(r => {
      const aids = [r.accountId, r.budgetAccountId, r.account_code, r.budgetSubjectCode, r.budgetAccountCode];
      return aids.some(a => String(a || '') === '13403' || String(a || '').includes('13403'));
    });
    const items = filtered.length > 0 ? filtered : rows;

    console.log('\n  总行数:', rows.length, '| 筛选(13403):', items.length);
    
    if (items.length === 0) { await browser.close(); return; }
    console.log('  Keys:', Object.keys(items[0]).slice(0, 12).join(', '));

    // Summarize
    const summary = {};
    items.forEach(r => {
      const org = r.orgName || r.budgetOrgName || r.org_name || r.budgetOrg || '';
      const budget = Math.abs(+(r.annbudgetamount || r.annBudgetAmount || r.yearBudget || r.totalBudget || 0));
      const used = Math.abs(+(r.actbudgetamount || r.actBudgetAmount || r.usedBudget || r.usedAmount || 0));
      if (!org) return;
      if (!summary[org]) summary[org] = { budget: 0, used: 0, count: 0 };
      summary[org].budget += budget;
      summary[org].used += used;
      summary[org].count++;
    });

    if (Object.keys(summary).length === 0) {
      console.log('  No org data found, dumping first row:');
      console.log(' ', JSON.stringify(items[0]).substring(0, 500));
      await browser.close(); return;
    }

    console.log('\n## 2026年预算 | 科目13403');
    console.log('| 组织 | 年预算 | 已使用 | 剩余 | 使用率 |');
    console.log('|------|--------|--------|------|--------|');
    let gt=0, gu=0;
    const sorted = Object.entries(summary).sort((a,b) => b[1].budget - a[1].budget);
    for (const [org, s] of sorted) {
      if (s.budget === 0 && s.used === 0) continue;
      const remain = s.budget - s.used;
      const rate = s.budget > 0 ? (s.used/s.budget*100).toFixed(1)+'%' : '0%';
      console.log(`| ${org} | ¥${s.budget.toLocaleString()} | ¥${s.used.toLocaleString()} | ¥${remain.toLocaleString()} | ${rate} |`);
      gt+=s.budget; gu+=s.used;
    }
    if (gt>0) console.log(`| **合计** | **¥${gt.toLocaleString()}** | **¥${gu.toLocaleString()}** | **¥${(gt-gu).toLocaleString()}** | **${(gu/gt*100).toFixed(1)}%** |`);
  } catch(e) {
    console.log('  Error:', e.message, '| Raw:', res.text.substring(0, 300));
  }

  await browser.close();
})().catch(e => console.error(e));
