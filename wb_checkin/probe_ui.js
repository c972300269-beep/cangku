/** 探针：连接 9222，点头像，dump 弹出面板文本结构，截图 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  let page = null;
  for (const ctx of browser.contexts())
    for (const p of ctx.pages()) { page = p; break; }
  if (!page) { console.log('NO PAGE'); process.exit(1); }
  console.log('page:', page.url().slice(0, 80));

  // 点左下角头像区域
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')];
    const cand = els.filter(e => {
      const r = e.getBoundingClientRect();
      return r.left < 300 && r.bottom > window.innerHeight - 120 && r.width > 0 && r.height > 0 && r.width < 200 && r.height < 120;
    });
    // 选最内层的（没有可点子元素的）
    for (const e of cand.reverse()) {
      const hasClickableChild = [...e.children].some(c => {
        const r2 = c.getBoundingClientRect();
        return r2.width > 0 && (c.onclick || c.tagName === 'BUTTON' || c.getAttribute('role') === 'button');
      });
      if (!hasClickableChild) { e.click(); return (e.innerText || '').slice(0, 40); }
    }
    return null;
  }).then(t => console.log('clicked avatar:', t));

  await page.waitForTimeout(3000);
  const shot = path.join(__dirname, 'probe_avatar.png');
  await page.screenshot({ path: shot });
  console.log('shot:', shot);

  // dump 所有可见文本块（去重，过滤太长的）
  const texts = await page.evaluate(() => {
    const out = new Set();
    const walk = (el) => {
      for (const c of el.children) walk(c);
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (own && own.length > 0 && own.length < 40) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.add(JSON.stringify({ t: own, x: Math.round(r.left), y: Math.round(r.top), tag: el.tagName, clickable: !!(el.onclick || el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') }));
      }
    };
    walk(document.body);
    return [...out];
  });
  console.log('--- visible text nodes ---');
  texts.forEach(t => console.log(t));
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
