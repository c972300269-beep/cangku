const { chromium } = require('playwright');
const fs = require('fs');

const BPM_URL = 'http://bpm.timesgroup.cn';

// 从描述中解析供应商和金额
function parseDesc(desc) {
  if (!desc) return { supplier: '', amount: '' };
  // 格式: （银河3420元）或（银河 3420元）或（3420元）
  const m = desc.match(/（([^0-9]*?)(\d+(?:\.\d+)?)\s*元/);
  if (m) {
    return {
      supplier: m[1].trim(),
      amount: m[2]
    };
  }
  return { supplier: '', amount: '' };
}

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

  // 读取已有数据
  const raw = fs.readFileSync('bpm_output/my_applying_requests.json', 'utf8');
  const clean = raw.replace(/new Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/g, (m,y,mo,d,h,mi,s) => {
    const dt = new Date(parseInt(y),parseInt(mo),parseInt(d),parseInt(h),parseInt(mi),parseInt(s));
    return JSON.stringify(dt.toISOString());
  });
  const data = JSON.parse(clean);

  // 筛选请款 + NC管理员
  const types = ['SRM非合同请款', 'SRM合同请款'];
  const targets = data.children.filter(t => {
    const isQingkuan = types.some(tp => t.ProcessName && t.ProcessName.includes(tp));
    const children = t.State?.children || [];
    const isNc = children.some(c => c.RecipientAccount === 'nc_admin');
    return isQingkuan && isNc;
  });

  console.log('[' + new Date().toISOString() + '] 共' + targets.length + '条请款流程在NC管理员手里，开始获取详情...');

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const created = t.CreateAt ? t.CreateAt.substring(0, 10) : '';

    // 先尝试从描述解析
    const { supplier, amount } = parseDesc(t.Description);

    let row = {
      serialNum: t.SerialNum,
      processName: t.ProcessName,
      description: (t.Description || '').replace(/<br\/>/g, ' '),
      supplier: supplier,
      amount: amount,
      createdAt: created,
      taskId: t.TaskID
    };

    // 合同请款且描述里没有金额的，尝试调详情接口
    const isHetong = t.ProcessName && t.ProcessName.includes('SRM合同请款');
    if ((!supplier || !amount) && isHetong) {
      try {
        // 尝试获取流程表单数据
        const detailUrl = BPM_URL + '/YZSoft.Services.REST/BPM/Task.ashx?method=GetTaskInfo&TaskID=' + t.TaskID + '&_dc=' + Date.now();
        const detailRes = await page.evaluate(async (url) => {
          const r = await fetch(url, { credentials: 'include' });
          return await r.text();
        }, detailUrl);
        
        // 尝试解析
        try {
          const detail = JSON.parse(detailRes);
          if (detail && typeof detail === 'object') {
            // 尝试找金额字段
            const allStr = JSON.stringify(detail);
            const amtMatch = allStr.match(/"?(?:Amount|amount|Money|money|Total|total|Sum|sum|金额|请款金额|付款金额)"?\s*[:：]\s*"?(\d+(?:\.\d+)?)/);
            if (amtMatch) row._foundAmount = amtMatch[1];
          }
        } catch(e) {}
      } catch(e) {}
    }

    results.push(row);
    if ((i+1) % 10 === 0) console.log('  进度: ' + (i+1) + '/' + targets.length);
  }

  // 输出CSV
  const csvLines = ['流水号,流程名称,请款内容,供应商,请款金额(元),请款日期,当前节点'];
  results.forEach(r => {
    const node = (() => {
      const children = targets.find(t => t.SerialNum === r.serialNum)?.State?.children || [];
      return children.map(c => c.StepName).join('|') || '';
    })();
    const desc = (r.description || '').replace(/,/g, '，').substring(0, 100);
    const supplier = (r.supplier || '').replace(/,/g, '，');
    const amount = r.amount || '';
    const date = r.createdAt || '';
    csvLines.push([r.serialNum, r.processName, desc, supplier, amount, date, node].map(v => '"' + v + '"').join(','));
  });

  const csvContent = '\uFEFF' + csvLines.join('\n');  // BOM for Excel
  fs.writeFileSync('bpm_output/nc_qingkuan_export.csv', csvContent, 'utf8');
  console.log('[' + new Date().toISOString() + '] CSV已保存: bpm_output/nc_qingkuan_export.csv');
  console.log('共导出', results.length, '条');

  // 也输出一份详细列表到控制台
  console.log('\n=== 导出列表 ===\n');
  results.forEach((r, i) => {
    console.log((i+1) + '. [' + r.createdAt + '] ' + r.serialNum);
    console.log('   ' + r.processName + ' | ' + (r.description || '').substring(0, 60));
    console.log('   供应商: ' + (r.supplier || '（需查详情）') + ' | 金额: ' + (r.amount || '（需查详情）') + '元');
  });

  await browser.close();
})();
