// 找渲染进程里可调用的宿主桥（含 checkin/billing/provider/backend 关键字）
const { chromium } = require('playwright');

const FN = () => {
  const res = [];
  const keys = Object.keys(window);
  const interesting = keys.filter(k => /checkin|billing|provider|backend|bridge|host|ipc|api|sdk|wb/i.test(k));
  const describe = (k) => {
    let v;
    try { v = window[k]; } catch (e) { return k + ' -> [throw]'; }
    const t = typeof v;
    let methods = '';
    if (v && (t === 'object' || t === 'function')) {
      try { methods = Object.keys(v).slice(0, 30).join(','); } catch (e) { methods = '[err]'; }
    }
    return k + ' : ' + t + ' { ' + methods + ' }';
  };
  res.push('--- keys matching ---');
  interesting.forEach(k => res.push(describe(k)));
  // 递归找带 checkin 方法的对象
  res.push('--- scan for checkin methods ---');
  for (const k of keys) {
    let v; try { v = window[k]; } catch (e) { continue; }
    if (v && typeof v === 'object') {
      for (const k2 of Object.keys(v)) {
        try {
          if (/checkin|claim/i.test(k2)) res.push(k + '.' + k2 + ' -> ' + typeof v[k2]);
        } catch (e) {}
      }
    }
  }
  return res;
};

(async () => {
  let browser = null;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
    const page = browser.contexts()[0].pages()[0];
    (await page.evaluate(FN)).forEach(x => console.log('  ' + x));
  } catch (e) { console.log('ERROR ' + e.message); }
  finally { try { if (browser) await browser.close(); } catch (e) {} }
})();
