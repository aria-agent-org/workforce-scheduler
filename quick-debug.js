const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', e => errors.push(`PAGE ERROR: ${e.message}`));

  // Login
  await page.goto('https://shavtzak.site/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[type="email"]', 'admin@shavtzak.site');
  await page.fill('input[type="password"]', 'Admin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log(`After login: ${page.url()}`);
  console.log(`Login errors: ${errors.length}`);
  errors.forEach(e => console.log(`  ${e.slice(0, 150)}`));
  errors.length = 0;

  // Now do full reload of dashboard
  console.log('\nFull reload /dashboard:');
  await page.goto('https://shavtzak.site/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log(`URL: ${page.url()}`);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log(`Content: ${bodyText.slice(0, 200)}`);
  console.log(`Errors after reload: ${errors.length}`);
  errors.forEach(e => console.log(`  ${e.slice(0, 200)}`));
  
  await browser.close();
}

run().catch(e => console.error(e));
