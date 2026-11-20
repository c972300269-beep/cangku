const { chromium } = require('playwright');
const path = require('path');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  const page = await context.newPage();

  try {
    console.log('正在访问页面...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    console.log('页面已加载');

    // 截图
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_page.png'), fullPage: true });

    // 打印所有可见文本，帮助理解页面结构
    const bodyText = await page.evaluate(() => {
      // 查找所有包含"年份"、"预算"、"组织"、"科目"的元素
      const results = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent.trim();
        if (text.length > 0 && text.length < 200) {
          results.push(text);
        }
      }
      return results;
    });
    console.log('页面文本内容（前200条）:');
    bodyText.slice(0, 200).forEach((t, i) => console.log(`  [${i}] ${t}`));

    // 查找所有 input/select 元素
    const inputs = await page.evaluate(() => {
      const els = document.querySelectorAll('input, select, button, textarea');
      return Array.from(els).map(el => ({
        tag: el.tagName,
        type: el.type || '',
        placeholder: el.placeholder || '',
        name: el.name || '',
        id: el.id || '',
        class: el.className || '',
        value: el.value || '',
        text: el.textContent?.substring(0, 50) || '',
        visible: el.offsetParent !== null,
      }));
    });
    console.log('\nInput/Select/Button 元素:');
    inputs.forEach((el, i) => {
      if (el.visible || el.id || el.name || el.placeholder) {
        console.log(`  [${i}] tag=${el.tag} type=${el.type} id="${el.id}" name="${el.name}" placeholder="${el.placeholder}" class="${el.class}" value="${el.value}" text="${el.text}" visible=${el.visible}`);
      }
    });

    // 查找所有下拉框类元素
    const selects = await page.evaluate(() => {
      // 查找所有可能的下拉框容器
      const containers = [];
      document.querySelectorAll('.el-select, .ant-select, select, [class*="dropdown"], [class*="picker"], [class*="select"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        containers.push({
          tag: el.tagName,
          class: el.className,
          id: el.id,
          text: el.textContent?.substring(0, 100),
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
        });
      });
      return containers;
    });
    console.log('\n下拉框/选择器元素:');
    selects.forEach(s => console.log(`  class="${s.class}" id="${s.id}" text="${s.text}" pos=(${s.x},${s.y}) size=${s.w}x${s.h}`));

    // 查找包含"年份"的父元素结构
    const yearEls = await page.evaluate(() => {
      const results = [];
      const allEls = document.querySelectorAll('*');
      allEls.forEach(el => {
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent.trim() : '';
        if (text.includes('年份') && text.length < 50) {
          // 找到父元素链
          let parent = el.parentElement;
          let chain = [el.tagName + ':' + el.textContent.trim()];
          for (let i = 0; i < 5 && parent; i++) {
            chain.push(parent.tagName + (parent.className ? '.' + parent.className.split(' ')[0] : '') + (parent.id ? '#' + parent.id : ''));
            parent = parent.parentElement;
          }
          results.push({ text: el.textContent.trim(), chain: chain.join(' > ') });
        }
      });
      return results;
    });
    console.log('\n包含"年份"的元素链:');
    yearEls.forEach(y => console.log(`  text="${y.text}" chain=${y.chain}`));

    // 查找包含"预算"的元素
    const budgetEls = await page.evaluate(() => {
      const results = [];
      const allEls = document.querySelectorAll('*');
      allEls.forEach(el => {
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent.trim() : '';
        if ((text.includes('预算') || text.includes('科目')) && text.length < 100) {
          let parent = el.parentElement;
          let chain = [el.tagName + ':' + el.textContent.trim()];
          for (let i = 0; i < 5 && parent; i++) {
            chain.push(parent.tagName + (parent.className ? '.' + parent.className.split(' ')[0] : '') + (parent.id ? '#' + parent.id : ''));
            parent = parent.parentElement;
          }
          results.push({ text: el.textContent.trim(), chain: chain.join(' > ') });
        }
      });
      return results;
    });
    console.log('\n包含"预算/科目"的元素链:');
    budgetEls.forEach(b => console.log(`  text="${b.text}" chain=${b.chain}`));

    console.log('\n页面探索完成，浏览器保持60秒...');
    await page.waitForTimeout(60000);

  } catch (err) {
    console.error('错误:', err.message);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'budget_explore_error.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('完成');
  }
})();
