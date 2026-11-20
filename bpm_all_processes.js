const { chromium } = require('playwright');
const fs = require('fs');

async function safeClose(browser) {
  if (!browser) return;
  try { await browser.close().catch(() => {}); } catch {}
  try {
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) process.kill(proc.pid, 'SIGKILL');
  } catch {}
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/chenjialin3/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
  });
  
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    await page.goto('http://bpm.timesgroup.cn/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('登录OK');

    const baseUrl = 'http://bpm.timesgroup.cn';
    const APIs = [
      { name: 'Completed(MyRequest)', url: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetHistoryTasks&HistoryTaskType=MyRequest&ThisTaskState=Completed&byYear=0&start=0&limit=500' },
      { name: 'Running(MyRequest)', url: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetHistoryTasks&HistoryTaskType=MyRequest&ThisTaskState=Running&byYear=0&start=0&limit=500' },
      { name: 'GetMyStart', url: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetMyStart&start=0&limit=500' },
      { name: 'GetMyInitiate', url: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetMyInitiate&start=0&limit=500' },
      { name: 'GetMyProcess', url: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetMyProcess&start=0&limit=500' },
      { name: 'GetMyApply', url: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetMyApply&start=0&limit=500' },
      { name: 'GetAll', url: '/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetAll&start=0&limit=200' },
    ];

    const allResults = {};
    
    for (const api of APIs) {
      const result = await page.evaluate(async (url) => {
        try {
          const resp = await fetch(url);
          const text = await resp.text();
          try {
            const json = JSON.parse(text);
            return { total: json.total || json.children?.length || 0, hasChildren: !!json.children, success: true, sample: text.substring(0, 300) };
          } catch {
            return { text: text.substring(0, 200), success: false };
          }
        } catch(e) {
          return { error: e.message };
        }
      }, baseUrl + api.url);
      
      console.log(`${api.name}: total=${result.total}, hasChildren=${result.hasChildren}`);
      allResults[api.name] = result;
      
      if (result.total > 0 && result.hasChildren) {
        // Fetch full data
        const fullData = await page.evaluate(async (url) => {
          const resp = await fetch(url);
          return await resp.text();
        }, baseUrl + api.url);
        
        const data = JSON.parse(fullData);
        const processes = (data.children || []).map(p => ({
          TaskID: p.TaskID,
          SerialNum: p.SerialNum,
          ProcessName: p.ProcessName,
          Description: p.Description,
          CreateAt: p.CreateAt,
          State: p.State?.State || 'unknown'
        }));
        
        // Classify
        const types = {};
        for (const p of processes) {
          const name = p.ProcessName || '未知';
          if (!types[name]) types[name] = [];
          types[name].push(p);
        }
        
        const output = {
          apiName: api.name,
          total: processes.length,
          typeSummary: Object.fromEntries(Object.entries(types).map(([k,v]) => [k, v.length])),
          samples: Object.entries(types).map(([k,v]) => ({ type: k, examples: v.slice(0, 3).map(x => ({ desc: x.Description, sn: x.SerialNum, date: new Date(x.CreateAt).toLocaleDateString('zh-CN') })) }))
        };
        
        fs.writeFileSync(`E:/workbuddy/Claw/.workbuddy/bpm_output/processes_${api.name}.json`, JSON.stringify(output, null, 2), 'utf8');
        console.log(`  保存到 processes_${api.name}.json`);
      }
    }

    console.log('\n完成!');

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    await safeClose(browser);
  }
})();
