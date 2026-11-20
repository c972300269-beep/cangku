const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.goto('http://bpm.timesgroup.cn', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 15000));

  // 查询已批准的请款流程
  const params = new URLSearchParams({
    method: 'GetHistoryTasks',
    HistoryTaskType: 'MyRequest',
    ThisTaskState: 'approved',
    byYear: '0',
    start: '0',
    limit: '500',
    _dc: Date.now().toString()
  });
  const url = 'http://bpm.timesgroup.cn/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString();
  const res = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    return await r.text();
  }, url);

  const clean = res.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (m,y,mo,d,h,mi,s) => {
    const dt = new Date(parseInt(y),parseInt(mo),parseInt(d),parseInt(h),parseInt(mi),parseInt(s));
    return JSON.stringify(dt.toISOString());
  });
  const data = JSON.parse(clean);
  console.log('已批准总数:', data.total);

  // 筛选请款类
  const qingkuanTypes = ['SRM非合同请款', 'SRM合同请款'];
  const qingkuan = data.children.filter(t => {
    return qingkuanTypes.some(qt => t.ProcessName && t.ProcessName.includes(qt));
  });

  // 按创建时间倒序
  qingkuan.sort((a, b) => new Date(b.CreateAt) - new Date(a.CreateAt));
  console.log('请款类已批准:', qingkuan.length);
  console.log('');

  // 展示最新20条
  console.log('=== 最近批准的请款流程（最新20条）===\n');
  qingkuan.slice(0, 20).forEach((t, i) => {
    const created = t.CreateAt ? t.CreateAt.substring(0, 10) : '?';
    const finished = t.FinishedAt ? t.FinishedAt.substring(0, 10) : '?';
    console.log(`${i+1}. [${created}] ${t.SerialNum}`);
    console.log(`   流程: ${t.ProcessName}`);
    console.log(`   描述: ${(t.Description || '').replace(/<br\/>/g, ' ').substring(0, 100)}`);
    console.log(`   完成时间: ${finished}`);
    console.log('');
  });

  // 按完成时间分组统计最近
  const fs = require('fs');
  const byMonth = {};
  qingkuan.forEach(t => {
    const f = t.FinishedAt ? t.FinishedAt.substring(0, 7) : '未知';
    byMonth[f] = (byMonth[f] || 0) + 1;
  });

  console.log('=== 按完成月份统计 ===');
  Object.keys(byMonth).sort().reverse().forEach(m => {
    console.log(`  ${m}: ${byMonth[m]}条`);
  });

  await browser.close();
})();
