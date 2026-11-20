const { chromium } = require('playwright');

const BPM_URL = 'http://bpm.timesgroup.cn';
const DATAFILE = 'E:/workbuddy/Claw/.workbuddy/bpm_output/my_completed_qingkuan.json';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  console.log('[' + new Date().toISOString() + '] 登录中...');
  await page.goto(BPM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 15000));

  // 查询"已完成"的请款流程
  // 使用 GetHistoryTasks, HistoryTaskType=MyRequest, ThisTaskState=Completed
  const params = new URLSearchParams({
    method: 'GetHistoryTasks',
    HistoryTaskType: 'MyRequest',
    ThisTaskState: 'Completed',
    byYear: '0',
    start: '0',
    limit: '200',
    _dc: Date.now().toString()
  });

  const url = BPM_URL + '/YZSoft.Services.REST/BPM/TaskList.ashx?' + params.toString();
  console.log('[' + new Date().toISOString() + '] 查询已完成流程...');
  
  const response = await page.evaluate(async (apiUrl) => {
    const res = await fetch(apiUrl, { credentials: 'include' });
    const text = await res.text();
    return text;
  }, url);

  console.log('[' + new Date().toISOString() + '] 数据长度:', response.length);

  // 解析数据
  const data = JSON.parse(response);
  console.log('[' + new Date().toISOString() + '] 总完成数:', data.total);

  // 筛选请款流程
  const qingkuanTypes = ['SRM非合同请款', 'SRM合同请款', 'SRM合同审批', '补票工单'];
  const qingkuan = data.children.filter(t => {
    return qingkuanTypes.some(qt => t.ProcessName && t.ProcessName.includes(qt));
  });

  console.log('[' + new Date().toISOString() + '] 请款相关完成数:', qingkuan.length);
  console.log('');

  // 按创建时间倒序，展示最新20条
  qingkuan.sort((a, b) => new Date(b.CreateAt) - new Date(a.CreateAt));
  
  console.log('=== 最近完成的请款流程（最新20条）===\n');
  qingkuan.slice(0, 20).forEach((t, i) => {
    const created = t.CreateAt ? t.CreateAt.substring(0, 10) : '未知';
    const ended = t.FinishedAt ? t.FinishedAt.substring(0, 10) : '未知';
    console.log(`${i+1}. [${created}] ${t.SerialNum}`);
    console.log(`   流程: ${t.ProcessName}`);
    console.log(`   描述: ${(t.Description || '').replace(/<br\/>/g, ' ')}`);
    console.log(`   结束时间: ${ended}`);
    console.log('');
  });

  // 保存完整数据
  const fs = require('fs');
  fs.writeFileSync(DATAFILE, JSON.stringify({ total: qingkuan.length, children: qingkuan }, null, 2));
  console.log('[' + new Date().toISOString() + '] 已保存到:', DATAFILE);

  await browser.close();
})();
