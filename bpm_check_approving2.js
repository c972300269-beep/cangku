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
    await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(8000);

    // Check if login was successful
    const currentUrl = page.url();
    console.log('当前URL:', currentUrl);

    console.log('获取 GetHistoryTasks (Running)...');
    const data = await page.evaluate(async () => {
      const p = new URLSearchParams({ method: 'GetHistoryTasks', HistoryTaskType: 'MyRequest', ThisTaskState: 'Running', byYear: '0', start: '0', limit: '500', _dc: Date.now().toString() });
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + p.toString(), { credentials: 'include' });
      return await r.text();
    });

    // Save raw for debug
    const outPath = 'E:\\workbuddy\\Claw\\.workbuddy\\bpm_output\\my_applying_requests.json';
    const dir = 'E:\\workbuddy\\Claw\\.workbuddy\\bpm_output';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, data, 'utf8');
    console.log('原始数据已保存:', outPath);
    console.log('原始数据长度:', data.length, '字符');
    console.log('原始数据前500字:', data.substring(0, 500));

    // Clean and parse
    const clean = data.replace(/new Date\(([^)]+)\)/g, (_, args) => {
      const a = args.split(',').map(x => parseInt(x.trim()));
      return JSON.stringify(new Date(a[0], a[1], a[2], a[3] || 0, a[4] || 0, a[5] || 0).toISOString());
    });

    const j = JSON.parse(clean);
    const total = j.total || 0;
    console.log('\n=== 解析结果 ===');
    console.log('total字段:', total);
    console.log('children数组长度:', j.children ? j.children.length : 'undefined');
    console.log('success:', j.success);
    console.log('');

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
      console.log('无审批中的流程。');
    }

    // Also try GetWorkList
    console.log('\n=== 也查一下待办任务 ===');
    const workData = await page.evaluate(async () => {
      const p = new URLSearchParams({ method: 'GetWorkList', start: '0', limit: '500', _dc: Date.now().toString() });
      const r = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?' + p.toString(), { credentials: 'include' });
      return await r.text();
    });
    const wClean = workData.replace(/new Date\(([^)]+)\)/g, (_, args) => {
      const a = args.split(',').map(x => parseInt(x.trim()));
      return JSON.stringify(new Date(a[0], a[1], a[2], a[3] || 0, a[4] || 0, a[5] || 0).toISOString());
    });
    const wj = JSON.parse(wClean);
    console.log('待办任务 总条数:', wj.total || 0);
    if (wj.children && wj.children.length > 0) {
      wj.children.forEach((item, i) => {
        console.log('【' + (i + 1) + '】' + (item.SerialNum || '—') + ' | ' + (item.ProcessName || '—') + ' | ' + (item.StepName || '—'));
      });
    }

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    await browser.close();
  }
})();
