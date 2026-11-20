const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = 'E:/workbuddy/Claw/reports';
const CDP_PORT = 9222;
const URL = 'https://xfk.linli580.cn/eacp/budget/home/budget_view/BudgetViewDetail';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const page = browser.contexts()[0].pages()[0];

  console.log('当前URL:', page.url());

  if (!page.url().includes('BudgetView')) {
    console.log('跳转到目标页面...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);
  }

  // 截图
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'explore.png'), fullPage: true });

  // 获取页面HTML片段
  const htmlSnapshot = await page.evaluate(() => {
    // 找包含"年份"的父元素
    const results = {};
    
    // 1. 搜索所有包含关键文本的元素
    const keywords = ['年份', '预算组织', '预算科目', '查询', '搜索', '设备设施'];
    const body = document.body;

    // 用 XPath 找
    const getXPath = (el) => {
      let path = '';
      while (el && el.nodeType === 1) {
        let idx = 1;
        let sib = el.previousSibling;
        while (sib) {
          if (sib.nodeType === 1 && sib.nodeName === el.nodeName) idx++;
          sib = sib.previousSibling;
        }
        path = '/' + el.nodeName.toLowerCase() + '[' + idx + ']' + path;
        el = el.parentNode;
      }
      return path;
    };

    // 2. 获取所有 input, select, button 元素
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea, button')).map(el => ({
      tag: el.tagName,
      type: el.type || '',
      id: el.id,
      name: el.name,
      class: el.className,
      placeholder: el.placeholder || '',
      text: el.textContent?.trim().substring(0, 50) || '',
      value: el.value || '',
      xpath: getXPath(el),
    }));

    // 3. 获取页面主体HTML (截取部分)
    const mainContent = document.querySelector('body')?.innerHTML?.substring(0, 5000) || '';

    // 4. 找所有 visible text nodes 包含关键词
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t && keywords.some(k => t.includes(k)) && t.length < 100) {
        const parent = node.parentElement;
        textNodes.push({
          text: t,
          parentTag: parent.tagName,
          parentClass: parent.className,
          parentId: parent.id,
          xpath: getXPath(parent),
        });
      }
    }

    return { inputs, textNodes, mainContent };
  });

  console.log('\n===== 关键文本节点 =====');
  htmlSnapshot.textNodes.forEach(n => {
    console.log(`  "${n.text}" <- ${n.parentTag}.${n.parentClass} [${n.xpath}]`);
  });

  console.log('\n===== 输入/按钮元素 =====');
  htmlSnapshot.inputs.filter(i => i.id || i.placeholder || i.text || i.name).forEach(i => {
    console.log(`  ${i.tag}#${i.id} .${i.class} name="${i.name}" placeholder="${i.placeholder}" text="${i.text}" value="${i.value}"`);
  });

  // 保存HTML到文件以供分析
  fs.writeFileSync(path.join(OUTPUT_DIR, 'page_structure.html'), htmlSnapshot.mainContent);
  console.log('\nHTML结构已保存到 reports/page_structure.html');
  
  await browser.close();
  console.log('完成');
})().catch(err => console.error('错误:', err.message));
