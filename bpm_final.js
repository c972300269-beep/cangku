const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Use user's Chrome profile for NTLM credentials
  const userDataDir = 'E:/workbuddy/Claw/.workbuddy/tmp/bpm_profile';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: [
      '--window-size=1920,1080',
      '--ignore-certificate-errors',
      '--auth-server-whitelist=*.timesgroup.cn',
      '--auth-negotiate-delegate-whitelist=*.timesgroup.cn',
    ],
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    console.log('[1] 访问BPM (persistent + NTLM)...');
    await page.goto('https://bpm.timesgroup.cn/', { 
      waitUntil: 'domcontentloaded', timeout: 60000 
    });
    await wait(10000);
    
    console.log('  标题:', await page.title());
    console.log('  URL:', page.url());
    
    const bodyText = await page.evaluate(() => {
      return (document.body?.innerText || '').substring(0, 800);
    });
    console.log('  内容:', bodyText);
    
    // If still on login page, try clicking NT login
    if (bodyText.includes('NT 登录')) {
      console.log('  点击NT登录...');
      await page.locator('a:has-text("NT"), button:has-text("NT")').first().click().catch(() => {});
      await wait(10000);
      console.log('  登录后:', await page.title());
      console.log('  URL:', page.url());
    }
    
    // Now try API calls
    const mainBody = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    
    if (mainBody.includes('流程中心') || mainBody.includes('待办') || mainBody.includes('我发起')) {
      console.log('\n[2] BPM主页加载成功, 尝试API...');
      
      const r1 = await page.evaluate(async () => {
        const resp = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetHistoryTasks&HistoryTaskType=MyRequest&ThisTaskState=Running&byYear=0&start=0&limit=200');
        return { status: resp.status, text: await resp.text() };
      });
      
      console.log('  我发起的-审批中:', r1.status);
      try {
        const d = JSON.parse(r1.text);
        if (d.success === false) {
          console.log('  ' + d.errorMessage);
        } else {
          const items = d.rows || d.data || [];
          console.log('  Total: ' + (d.total || items.length));
          items.slice(0, 15).forEach((item, i) => {
            console.log('  ' + (i+1) + '. [' + (item.ProcessName||item.FlowName||'') + '] ' + (item.Subject||item.TaskName||item.SN||''));
          });
        }
      } catch(e) {
        console.log('  响应:', r1.text.substring(0, 300));
      }
      
      const r2 = await page.evaluate(async () => {
        const resp = await fetch('/YZSoft.Services.REST/BPM/TaskList.ashx?method=GetWorkList');
        return { status: resp.status, text: await resp.text() };
      });
      
      console.log('\n  待办任务:', r2.status);
      try {
        const d = JSON.parse(r2.text);
        if (d.success === false) {
          console.log('  ' + d.errorMessage);
        } else {
          const items = d.rows || d.data || [];
          console.log('  Total: ' + (d.total || items.length));
          items.slice(0, 15).forEach((item, i) => {
            console.log('  ' + (i+1) + '. [' + (item.ProcessName||item.FlowName||'') + '] ' + (item.Subject||item.TaskName||item.SN||''));
          });
        }
      } catch(e) {
        console.log('  响应:', r2.text.substring(0, 300));
      }
    } else {
      console.log('  未进入BPM主页');
      await page.screenshot({ path: 'E:/workbuddy/Claw/reports/bpm_debug.png' });
    }
    
    // Save auth state for future use
    await context.storageState({ path: 'E:/workbuddy/Claw/.workbuddy/tmp/bpm_auth.json' });
    console.log('\n✓ auth state saved');

  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await context.close();
  }
})();
