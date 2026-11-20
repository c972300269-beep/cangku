const { chromium } = require('playwright');

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(() => {}); } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

// Pick representative processes for each type
const samples = [
  { type: '邻里-SRM非合同请款-电梯维修', taskId: 10522928, desc: '电梯更换曳引钢丝绳' },
  { type: '邻里-SRM非合同请款-配件更换', taskId: 10212429, desc: '货梯更换应急电源' },
  { type: '邻里-SRM非合同请款-工程物料', taskId: 10632554, desc: '物料费' },
  { type: '邻里-SRM合同请款-维保', taskId: 10615842, desc: '消防维保费' },
  { type: '邻里-补票工单', taskId: 10645938, desc: '水费补票' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
  });
  
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    await page.goto('http://bpm.timesgroup.cn/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);
    console.log('登录OK\n');

    // Navigate to process forms
    for (const sample of samples.slice(0, 2)) {
      console.log(`=== ${sample.type}: ${sample.desc} ===`);
      console.log(`TaskID: ${sample.taskId}`);
      
      const processUrl = `http://bpm.timesgroup.cn/BPM2018/Process.aspx?TaskID=${sample.taskId}`;
      try {
        await page.goto(processUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(8000);
        
        // Try to get form content
        const formData = await page.evaluate(() => {
          // Get all visible text
          const bodyText = document.body.innerText;
          
          // Try to get form fields
          const inputs = Array.from(document.querySelectorAll('input[type="text"], textarea, input:not([type="hidden"])')).map(el => ({
            name: el.name || el.id || el.placeholder || '',
            value: el.value || '',
            type: el.tagName
          }));
          
          return {
            textLength: bodyText.length,
            inputs: inputs.slice(0, 30),
            snippet: bodyText.substring(0, 2000)
          };
        });
        
        console.log(`表单文本长度: ${formData.textLength}`);
        console.log(`表单字段数: ${formData.inputs.length}`);
        console.log('文本片段:');
        console.log(formData.snippet);
        console.log('');
      } catch(e) {
        console.log(`  错误: ${e.message}`);
      }
    }

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    await safeClose(browser);
  }
})();
