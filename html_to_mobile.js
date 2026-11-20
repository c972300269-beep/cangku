const { chromium } = require('playwright');
const path = require('path');

const SRC = 'E:/workbuddy/2026-07-15-09-18-53/budget_report.html';
const OUT_DIR = 'E:/workbuddy/Claw/reports';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('file:///' + SRC.replace(/\\/g, '/'), { waitUntil: 'networkidle' });

  // PDF - landscape A4
  await page.pdf({
    path: path.join(OUT_DIR, 'budget_report.pdf'),
    format: 'A3',
    landscape: true,
    printBackground: true,
    margin: { top: 10, bottom: 10, left: 10, right: 10 },
  });
  console.log('PDF done');

  // Full page screenshot for mobile preview
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({
    path: path.join(OUT_DIR, 'budget_report_mobile.png'),
    fullPage: true,
  });
  console.log('PNG done');

  await browser.close();
  console.log('Done - pdf + png');
})().catch(console.error);
