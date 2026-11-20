const http = require('http');
const path = require('path');

const OUT = 'E:/workbuddy/Claw/reports';

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 30000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

(async () => {
  // Login
  console.log('登录...');
  const loginBody = 'username=chenjialin3&password=chenjialin&grant_type=password&validCode=';
  const loginResp = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'bpm.timesgroup.cn', path: '/bpm/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(loginBody) }
    }, (res) => {
      let d = '';
      const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ cookies, body: d }));
    });
    req.on('error', reject);
    req.write(loginBody);
    req.end();
  });

  const cookies = loginResp.cookies;
  console.log('Login cookies:', cookies.substring(0, 80));

  // Fetch data
  const data = await new Promise((resolve, reject) => {
    http.get({
      hostname: 'bpm.timesgroup.cn',
      path: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetHistoryTasks&HistoryTaskType=MyRequest&ThisTaskState=Running&byYear=0&start=0&limit=500',
      headers: { Cookie: cookies }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });

  const json = JSON.parse(data);
  const items = json.children || [];
  console.log(`Total: ${items.length}`);

  // Categorize by node
  const categories = {};
  items.forEach(item => {
    const state = item.State;
    const children = state?.children || [];
    const nodeName = children.length > 0 ? children[0].StepName : '未知';
    const handler = children.length > 0 ? children[0].RecipientDisplayName : '';
    
    if (!categories[nodeName]) {
      categories[nodeName] = { count: 0, items: [], handler };
    }
    categories[nodeName].count++;
    categories[nodeName].items.push(item);
  });

  // Format output
  let md = '## BPM流程概览 — "我发起的流程"审批中\n\n';
  md += `**总条数：${items.length}条**\n\n`;
  
  // By node
  md += '### 按当前节点分类\n\n';
  md += '| 节点 | 数量 | 关键信息 |\n';
  md += '|------|------|----------|\n';
  
  const sortedCats = Object.entries(categories).sort((a, b) => b[1].count - a[1].count);
  sortedCats.forEach(([node, cat]) => {
    const timeRange = cat.items.length > 0 ? 
      `${cat.items[cat.items.length - 1].CreateAt.substring(0, 7)} ~ ${cat.items[0].CreateAt.substring(0, 10)}` : '';
    const emoji = cat.count > 1 ? '' : (node.includes('发起人') || node.includes('送件') ? ' ⚠️' : '');
    md += `| ${node}${emoji} | ${cat.count}条 | ${cat.handler}处理中，${timeRange} |\n`;
  });
  
  // Recent 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const recent = items.filter(item => new Date(item.CreateAt) > sevenDaysAgo);
  
  md += '\n### 最近7天新增（需关注）\n\n';
  md += '| 流水号 | 流程类型 | 描述 | 当前节点 |\n';
  md += '|--------|----------|------|----------|\n';
  
  recent.forEach(item => {
    const node = (item.State?.children || [{}])[0].StepName || '未知';
    const handler = (item.State?.children || [{}])[0].RecipientDisplayName || '';
    const desc = item.Description || '';
    const sn = item.SerialNum;
    const warn = node.includes('发起人') || node.includes('送件') ? ' ⚠️' : '';
    md += `| ${sn}${warn} | ${item.ProcessName} | ${desc} | ${node}（${handler}） |\n`;
  });
  
  // Warnings
  const warnings = items.filter(item => {
    const node = (item.State?.children || [{}])[0].StepName || '';
    return node.includes('发起人') || node.includes('送件');
  });
  
  if (warnings.length > 0) {
    md += '\n';
    warnings.forEach(w => {
      md += `> ⚠️ **${w.SerialNum}** 卡在"${(w.State?.children || [{}])[0].StepName}"节点，需要进入系统手动推进。\n`;
    });
  }

  // Very old items
  const oldItems = items.filter(item => new Date(item.CreateAt) < new Date('2025-11-01'));
  if (oldItems.length > 0) {
    md += `\n> 📌 还有 ${oldItems.length} 条老流程卡住（最早 ${oldItems[oldItems.length-1].CreateAt.substring(0, 10)}），建议确认是否可撤回或作废。\n`;
  }

  console.log(md);
  
  // Save
  const fs = require('fs');
  fs.writeFileSync(path.join(OUT, 'bpm_summary.md'), md);
  console.log('\nSaved: reports/bpm_summary.md');
})();
