// BPM 数据抓取脚本 v16 - 修复浏览器关闭问题
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const BPM_USER = process.env.BPM_USER || 'chenjialin3';
  const BPM_PASS = process.env.BPM_PASS || '__REDACTED_SECRET__';
  const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '..');
  const BASE = 'https://bpm.timesgroup.cn';
  const API = BASE + '/YZSoft.Services.REST/BPM/TaskList.ashx';

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Users/chenjialin3/.workbuddy/binaries/playwright-browsers/chromium-1228/chrome-win64/chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const context = await browser.newContext({ 
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    // 使用 context.request API（共享浏览器cookies，在Node端执行，更可靠）
    const fetchRaw = async (url) => {
      try {
        const res = await context.request.get(url, {
          timeout: 30000,
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': BASE + '/'
          }
        });
        const text = await res.text();
        console.log(`  [context.request] status=${res.status()}, len=${text?.length || 0}`);
        return { status: res.status(), text };
      } catch(e) {
        console.log(`  [context.request] error: ${e.message}`);
        // 降级到 page.evaluate(fetch) 方式
        try {
          const r = await page.evaluate(async(u) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            try {
              const res = await fetch(u, { credentials: 'include', signal: controller.signal });
              return { status: res.status, text: await res.text() };
            } catch(e) {
              return { status: 0, text: '', error: e.message };
            } finally {
              clearTimeout(timeoutId);
            }
          }, url);
          console.log(`  [page.evaluate] status=${r.status}, len=${r.text?.length || 0}`);
          return r;
        } catch(e2) {
          console.log(`  [page.evaluate] error: ${e2.message}`);
          return { status: 0, text: '', error: e2.message };
        }
      }
    };

    const result = {
      fetch_time: new Date().toISOString(),
      daishenpi: 0, shenpizhong: 0, yitongguo: 0,
      daishenpi_list: [], shenpizhong_list: [], yitongguo_list: [],
      error: null
    };

    console.log('登录...');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 首页跳登录页的时机不稳定（有时 2s、有时 5s 以上），改为轮询等登录表单出现
    let loginReady = false;
    for (let i = 0; i < 15; i++) {
      try {
        if (await page.locator('input[placeholder="账号"]').count() > 0) { loginReady = true; break; }
      } catch (e) {}
      await page.waitForTimeout(3000);
    }

    if (loginReady) {
      let loggedIn = false;
      for (let attempt = 1; attempt <= 2 && !loggedIn; attempt++) {
        await page.fill('input[placeholder="账号"]', BPM_USER);
        await page.fill('input[placeholder="密码"]', BPM_PASS);
        await page.waitForTimeout(600);
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('a,button,span,div')) {
            if ((el.innerText?.trim() === '登 录' || el.innerText?.trim() === '登录') && el.children.length <= 2) { el.click(); return; }
          }
        });
        for (let i = 0; i < 12; i++) {
          await page.waitForTimeout(3000);
          if (!page.url().includes('login')) { loggedIn = true; break; }
          const hasForm = await page.locator('input[placeholder="账号"]').count();
          if (hasForm === 0) { loggedIn = true; break; }
        }
        if (!loggedIn) console.log(`  登录第 ${attempt} 次未成功，重试...`);
      }
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch(e) {}
      console.log('已登录:', page.url());
      if (!loggedIn) {
        throw new Error('BPM 登录失败（仍停留在登录页），请检查账号密码');
      }
    } else {
      console.log('  未出现登录表单（可能已有会话），继续:', page.url());
    }

    // ========== 待审批 ==========
    console.log('\n获取待审批...');
    const dsRaw = await fetchRaw(`${API}?method=GetTotalList&_dc=${Date.now()}`);
    console.log(`  status=${dsRaw.status}, len=${dsRaw.text?.length || 0}`);

    if (dsRaw.text && dsRaw.status === 200) {
      const j = safeParse(dsRaw.text);
      if (Array.isArray(j.children)) {
        result.daishenpi_list = j.children.map(normalize).filter(r => r.SerialNum);
        result.daishenpi = j.total || result.daishenpi_list.length;
        console.log(`  成功! total=${j.total}, items=${j.children.length}`);
      } else {
        console.log(`  格式不对, keys=${Object.keys(j).join(',')}`);
        console.log(`  前300字:`, dsRaw.text.substring(0,300));
      }
    }

    // ========== 审批中 ==========
    console.log('\n获取审批中...');
    const spUrl = `${API}?method=GetHistoryTasks&HistoryTaskType=MyRequest&SpecProcessName=&byYear=1&Year=2026&ThisTaskState=Running&page=1&start=0&limit=500&_dc=${Date.now()}`;
    const spRaw = await fetchRaw(spUrl);
    console.log(`  status=${spRaw.status}, len=${spRaw.text?.length || 0}`);

    if (spRaw.text && spRaw.status === 200) {
      const j = safeParse(spRaw.text);
      if (j.success === false) {
        console.log(`  API错误: ${j.errorMessage}`);
      } else if (Array.isArray(j.children)) {
        result.shenpizhong_list = j.children.map(normalize).filter(r => r.SerialNum);
        result.shenpizhong = j.total || result.shenpizhong_list.length;
        console.log(`  成功! total=${j.total}, items=${j.children.length}`);
      } else {
        console.log(`  格式不对, keys=${Object.keys(j).join(',')}`);
        console.log(`  前300字:`, spRaw.text.substring(0,300));
      }
    }

    // ========== 已通过 ==========
    console.log('\n获取已通过...');
    const ytUrl = `${API}?method=GetHistoryTasks&HistoryTaskType=MyRequest&SpecProcessName=&byYear=1&Year=2026&ThisTaskState=Approved&page=1&start=0&limit=500&_dc=${Date.now()}`;
    const ytRaw = await fetchRaw(ytUrl);
    console.log(`  status=${ytRaw.status}, len=${ytRaw.text?.length || 0}`);

    if (ytRaw.text && ytRaw.status === 200) {
      const j = safeParse(ytRaw.text);
      if (j.success === false) {
        console.log(`  API错误: ${j.errorMessage}`);
      } else if (Array.isArray(j.children)) {
        result.yitongguo_list = j.children.map(normalize).filter(r => r.SerialNum);
        result.yitongguo = j.total || result.yitongguo_list.length;
        console.log(`  成功! total=${j.total}, items=${j.children.length}`);
      } else {
        console.log(`  格式不对, keys=${Object.keys(j).join(',')}`);
        console.log(`  前300字:`, ytRaw.text.substring(0,300));
      }
    }

    // 校验：登录失败或数据全 0 视为抓取失败，交由调用方重试（避免发空简报）
    if (result.daishenpi === 0 && result.shenpizhong === 0 && result.yitongguo === 0) {
      throw new Error('BPM 数据全为 0（登录态失效或接口异常）');
    }

    // 保存
    fs.writeFileSync(path.join(OUTPUT_DIR, 'bpm_data.json'), JSON.stringify(result, null, 2), 'utf-8');

    console.log('\n========== 完成 ==========');
    console.log(`待审批: ${result.daishenpi} (${result.daishenpi_list.length})`);
    console.log(`审批中: ${result.shenpizhong} (${result.shenpizhong_list.length})`);
    console.log(`已通过: ${result.yitongguo} (${result.yitongguo_list.length})`);

  } catch(e) {
    console.error('错误:', e.message);
    const result = {
      fetch_time: new Date().toISOString(),
      daishenpi: 0, shenpizhong: 0, yitongguo: 0,
      daishenpi_list: [], shenpizhong_list: [], yitongguo_list: [],
      error: e.message
    };
    // 抓取失败时不要把空数据覆盖到 bpm_data.json（会毁掉上一次的好数据），单独落错误文件
    fs.writeFileSync(path.join(OUTPUT_DIR, 'bpm_data_error.json'), JSON.stringify(result, null, 2), 'utf-8');
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();

// 安全JSON解析（BPM返回的"JSON"含 new Date(...) 等JS表达式，需预处理）
function safeParse(text) {
  if (!text || typeof text !== 'string') { return { _error: 'empty input' }; }
  try {
    // 替换 new Date(YYYY,M,D,H,m,s) 为 ISO 字符串
    let fixed = text.replace(
      /new Date\((\d{4}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2}),(\d{1,2})\)/g,
      (_,y,m,d,h,min,s) => {
        const mm = String(parseInt(m)+1).padStart(2,'0');
        const dd = String(d).padStart(2,'0');
        const hh = String(h).padStart(2,'0');
        const mi = String(min).padStart(2,'0');
        const sec = String(s).padStart(2,'0');
        return `"${y}-${mm}-${dd}T${hh}:${mi}:${sec}"`;
      }
    );
    return JSON.parse(fixed);
  } catch(e) { 
    // 如果还失败，尝试用 eval（不安全但能处理复杂JS表达式）
    try {
      return eval('(' + text + ')');
    } catch(e2) {
      return { _error: e.message + '; ' + e2.message }; 
    }
  }
}

function normalize(raw) {
  if (!raw) return {};
  
  const item = {};
  const skipKeys = ['State','Recipient','perm'];
  const map = {
    SerialNum:'SerialNum', ProcessName:'ProcessName', ProcessVersion:'ProcessVersion',
    ProcessTag:'ProcessTag', ProcessType:'ProcessType',
    OwnerAccount:'OwnerAccount', OwnerDisplayName:'OwnerDisplayName',
    OwnerShortName:'OwnerShortName',
    NodeName:'NodeName', RecipientShortName:'RecipientShortName',
    Description:'Description', CreateAt:'CreateTime', ReceiveAt:'ReceiveTime',
    StepID:'StepID', TaskID:'TaskID', TimeoutNotifyCount:'TimeoutNotifyCount',
    Progress:'Progress'
  };
  
  for (const [s, d] of Object.entries(map)) {
    if (raw[s] !== undefined && raw[s] !== null && raw[s] !== '') {
      item[d] = String(raw[s]).replace(/<br\s*\/?>/gi, ' ');
    }
  }
  
  if (raw.State?.State) item.StatusName = String(raw.State.State);
  if (raw.Recipient?.displayName) item.RecipientName = String(raw.Recipient.displayName);
  
  // Extract NodeName/Recipient from State.children (for GetHistoryTasks items)
  if (!item.NodeName && raw.State?.children?.length) {
    const nodes = raw.State.children.map(c => c.StepName || '').filter(Boolean);
    const recipients = raw.State.children.map(c => c.RecipientDisplayName || '').filter(Boolean);
    if (nodes.length) item.NodeName = [...new Set(nodes)].join('; ');
    if (recipients.length) item.RecipientShortName = [...new Set(recipients)].join('; ');
  }
  
  for (const [k, v] of Object.entries(raw)) {
    if (k in map || k in item || skipKeys.includes(k)) continue;
    if (v === undefined || v === null || typeof v === 'object') continue;
    const sv = String(v).trim();
    if (sv && sv.length < 500) item[k] = sv.replace(/<br\s*\/?>/gi, ' ');
  }
  
  return item;
}
