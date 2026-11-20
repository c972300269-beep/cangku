const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\chenjialin3\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: {width:1920,height:1080}, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    console.log('登录中...');
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);

    console.log('获取数据...');
    const data = await page.evaluate(async () => {
      const p = new URLSearchParams({ method: 'GetHistoryTasks', HistoryTaskType: 'MyRequest', ThisTaskState: 'Running', byYear: '0', start: '0', limit: '500', _dc: Date.now().toString() });
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + p.toString(), { credentials: 'include' });
      return await r.text();
    });

    // Clean and parse
    const clean = data.replace(/new Date\(([^)]+)\)/g, (_, args) => {
      const a = args.split(',').map(x => parseInt(x.trim()));
      return JSON.stringify(new Date(a[0], a[1], a[2], a[3] || 0, a[4] || 0, a[5] || 0).toISOString());
    });

    const j = JSON.parse(clean);
    const total = j.total || 0;
    console.log('\n========================================');
    console.log('  BPM "我发起的流程" — 审批中');
    console.log('  总条数: ' + total + ' 条');
    console.log('========================================\n');

    if (j.children && j.children.length > 0) {
      j.children.forEach((item, i) => {
        console.log('【' + (i + 1) + '】' + (item.SerialNum || '—'));
        console.log('  流程类型: ' + (item.ProcessName || '—'));
        console.log('  描述:     ' + ((item.Description || '').replace(/<br\/>/g, ' ')));
        console.log('  当前节点: ' + (item.StepName || '—'));
        console.log('  发起人:   ' + (item.OwnerDisplayName || '—'));
        console.log('  创建时间: ' + (item.CreateAt ? new Date(item.CreateAt).toLocaleString('zh-CN') : '—'));
        console.log('');
      });
    } else {
      console.log('  无审批中的流程。\n');
    }
  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    await browser.close();
  }
})();
