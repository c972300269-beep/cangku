const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(require('puppeteer-core'));
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ORGS = ['GZ1-3001QYQCP008','GZ1-3001QYQCP009','GZ1-3001QYQCP036','QY1-3003QYP002'];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  console.log('[1] 登录...');
  await page.goto('https://xfk.linli580.cn/eacp/user/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  await page.type('input[placeholder*="帐户名"], input[placeholder*="邮箱"]', 'chenjialin3');
  await page.type('input[placeholder*="密码"]', 'chenjialin');
  await sleep(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='登录'); if (b) b.click(); });
  await sleep(8000);
  console.log('  登录后:', page.url());

  console.log('[2] 获取Token...');
  let token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const val = localStorage.getItem(key);
      try {
        const obj = JSON.parse(val);
        if (obj.access_token) return obj.access_token;
        if (obj.token) return obj.token;
        if (obj.value && key.includes('token')) return obj.value;
      } catch {}
      if (key.includes('token')) return val;
    }
    return null;
  });
  if (!token) { console.log('  No token!'); await browser.close(); return; }
  console.log('  获得:', token.substring(0, 25) + '...');

  console.log('[3] 查询...');
  const formats = [
    { name: 'Q_main+period+orgs+account', body: { Q_main: { PERIOD_S_EQ: '2026', ORG_ID_S_IN: ORGS.join(','), ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 } },
    { name: 'Q_main+period only', body: { Q_main: { PERIOD_S_EQ: '2026' }, page: 0, size: 500 } },
    { name: 'Q_main+period+account', body: { Q_main: { PERIOD_S_EQ: '2026', ACCOUNT_ID_S_EQ: '13403' }, page: 0, size: 500 } },
  ];

  let okRes = null;
  for (const f of formats) {
    const r = await page.evaluate(async ({ t, body }) => {
      const res = await fetch('/api/api-budget/budget/view/detail/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: JSON.stringify(body)
      });
      return { status: res.status, text: await res.text() };
    }, { t: token, body: f.body });
    const isOk = r.text.includes('"success":true') || r.text.includes('"code":200');
    console.log(`  ${f.name}: ${r.status} ${isOk ? 'OK' : r.text.substring(0, 120).replace(/\n/g,' ')}`);
    if (isOk) { okRes = r; break; }
  }

  if (!okRes) {
    console.log('  ⚠ 所有格式均失败');
    await browser.close();
    return;
  }

  try {
    const data = JSON.parse(okRes.text);
    const rows = data.list || data.rows || data.data || data.records || [];
    const total = data.total || rows.length;
    console.log(`\n  总条数: ${total}`);

    if (rows.length > 0 && typeof rows[0] === 'object') {
      const keys = Object.keys(rows[0]);
      
      // Find budget/amount related columns
      const budgetKeys = keys.filter(k => k.toLowerCase().includes('budget') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('org'));
      console.log('  关键列:', budgetKeys.join(', '));
      
      // Simple summary
      const summary = {};
      rows.forEach(r => {
        const org = r.orgName || r.budgetOrgName || r.budgetOrg || '未知';
        const name = r.budgetAccountName || r.accountName || '';
        const total = parseFloat(r.annbudgetamount || r.yearBudget || r.totalBudget || 0);
        const used = parseFloat(r.actbudgetamount || r.usedBudget || r.actualBudget || 0);
        const monthKeys = keys.filter(k => /m\d{2}budgetamount/i.test(k));
        
        if (!summary[org]) summary[org] = { total: 0, used: 0, months: {} };
        summary[org].total += total;
        summary[org].used += used;
        monthKeys.forEach(mk => {
          const m = parseFloat(r[mk] || 0);
          const month = mk.substring(0, 3);
          summary[org].months[month] = (summary[org].months[month] || 0) + m;
        });
      });
      
      console.log('\n## 2026年预算汇总 (科目13403)');
      console.log('| 组织 | 年预算 | 已使用 | 剩余 | 使用率 |');
      console.log('|------|--------|--------|------|--------|');
      let gt = 0, gu = 0;
      for (const [org, s] of Object.entries(summary)) {
        const rate = s.total > 0 ? (s.used / s.total * 100).toFixed(1) + '%' : '0%';
        console.log(`| ${org} | ¥${s.total.toLocaleString()} | ¥${s.used.toLocaleString()} | ¥${(s.total - s.used).toLocaleString()} | ${rate} |`);
        gt += s.total;
        gu += s.used;
      }
      const gr = gt > 0 ? (gu / gt * 100).toFixed(1) + '%' : '0%';
      console.log(`| **合计** | **¥${gt.toLocaleString()}** | **¥${gu.toLocaleString()}** | **¥${(gt-gu).toLocaleString()}** | **${gr}** |`);
    }
  } catch(e) {
    console.log('  解析错误:', e.message);
    console.log('  数据:', okRes.text.substring(0, 300));
  }

  await browser.close();
})().catch(e => console.error(e));
