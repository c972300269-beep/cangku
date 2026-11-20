const { chromium } = require('playwright');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: false, channel: 'chrome',
    args: [
      '--window-size=1920,1080',
      '--ignore-certificate-errors',
      '--auth-server-whitelist=*.timesgroup.cn',
      '--auth-negotiate-delegate-whitelist=*.timesgroup.cn',
    ],
  });
  const page = await browser.newPage({ 
    viewport: { width: 1920, height: 1080 }, 
    ignoreHTTPSErrors: true,
  });

  try {
    console.log('[1] 访问BPM...');
    page.on('pageerror', err => console.log('  [ERR]', err.message?.substring(0, 100)));
    
    await page.goto('https://bpm.timesgroup.cn/', { 
      waitUntil: 'domcontentloaded', timeout: 60000 
    });
    await wait(15000);
    
    console.log('  标题:', await page.title());
    console.log('  URL:', page.url());
    
    const bodyText = await page.evaluate(() => {
      return (document.body?.innerText || '').substring(0, 500);
    });
    console.log('  内容:', bodyText);
    
    // 点击 NT登录 按钮
    if (bodyText.includes('NT 登录') || bodyText.includes('NT登录')) {
      console.log('  检测到登录页面, 点击NT登录...');
      const clicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
        for (const b of btns) {
          if (b.textContent.includes('NT') || b.value?.includes('NT')) { b.click(); return true; }
        }
        return false;
      });
      if (!clicked) {
        await page.locator('text=NT 登录').first().click().catch(() => {});
        await page.locator('text=NT登录').first().click().catch(() => {});
      }
      await wait(10000);
      console.log('  登录后标题:', await page.title());
      console.log('  URL:', page.url());
    }
    
    await page.screenshot({ path: 'E:/workbuddy/Claw/reports/bpm_home.png' });
    console.log('\nDone - 截图: reports/bpm_home.png');

  } catch(e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: 'E:/workbuddy/Claw/reports/bpm_error.png' }).catch(()=>{});
  } finally {
    await browser.close();
  }
})();
