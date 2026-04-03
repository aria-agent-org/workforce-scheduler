const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}\n${e.stack || ''}`));

  // Login
  await page.goto('https://shavtzak.site/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[type="email"]', 'admin@shavtzak.site');
  await page.fill('input[type="password"]', 'Admin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Inject error catcher before reload
  await page.evaluate(() => {
    window.__origCreateElement = window.__origCreateElement || React?.createElement;
  });

  // Reload and catch
  console.log('\n=== RELOADING ===');
  await page.goto('https://shavtzak.site/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(5000);
  
  // Get the error details from the ErrorBoundary
  const errorDetails = await page.evaluate(() => {
    const pre = document.querySelector('pre');
    return pre?.textContent || '';
  });
  console.log(`\nError from ErrorBoundary: ${errorDetails}`);
  
  // Try to get more info
  const allText = await page.evaluate(() => document.body.innerText);
  console.log(`\nAll text: ${allText.slice(0, 500)}`);
  
  await browser.close();
}

run().catch(e => console.error(e));
