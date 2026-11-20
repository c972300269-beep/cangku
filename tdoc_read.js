const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    const url = 'https://docs.qq.com/sheet/DSUxOUGxUbVFvaXVS?tab=dh09ct';
    console.log('正在打开7月份表格...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(20000);

    const result = await page.evaluate(() => {
      function getCellText(cell) {
        if (cell === undefined || cell === null) return '';
        if (typeof cell === 'string') return cell;
        if (typeof cell === 'number') return String(cell);
        if (typeof cell === 'object') {
          if (cell.style && Object.keys(cell).length === 1) return '';
          if (cell.v !== undefined) return getCellText(cell.v);
          if (cell.value !== undefined) return getCellText(cell.value);
          if (cell.text !== undefined) return String(cell.text);
          if (cell.formattedValue !== undefined) return String(cell.formattedValue);
          return '';
        }
        return '';
      }

      const app = window.SpreadsheetApp;
      if (!app || !app.workbook) return { error: 'no workbook' };
      
      const sheet = app.workbook.activeSheet;
      const rowCount = sheet.getRowCount();
      
      // Find column indices from row 1 (actual header)
      let projectCol = -1, areaCol = -1;
      for (let c = 0; c < 15; c++) {
        const t = getCellText(sheet.getCellDataAtPosition(1, c));
        if (t === '项目名称') projectCol = c;
        if (t === '区域公司') areaCol = c;
      }
      
      // Search for keywords
      const keywords = ['清远', '龙湖苑', '雅悦花园'];
      const found = [];
      
      for (let r = 2; r < Math.min(rowCount, 9500); r++) {
        const projText = getCellText(sheet.getCellDataAtPosition(r, projectCol));
        const areaText = getCellText(sheet.getCellDataAtPosition(r, areaCol));
        
        for (const kw of keywords) {
          if (projText.includes(kw) || areaText.includes(kw)) {
            const rowData = [];
            for (let c = 0; c < 15; c++) {
              rowData.push(getCellText(sheet.getCellDataAtPosition(r, c)));
            }
            found.push({ row: r, data: rowData });
            break;
          }
        }
      }
      
      return { keywords, found, count: found.length };
    });
    
    console.log('搜索结果:', JSON.stringify(result, null, 2));

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    await browser.close().catch(() => {});
    try {
      const proc = browser.process ? browser.process() : null;
      if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
    } catch {}
  }
})();
