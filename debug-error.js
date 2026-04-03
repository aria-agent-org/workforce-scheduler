const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture ALL errors
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' || text.includes('Error') || text.includes('error')) {
      console.log(`[console.${msg.type()}] ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', e => console.log(`[pageerror] ${e.message.slice(0, 300)}\n${e.stack?.slice(0, 500) || ''}`));

  // Login
  await page.goto('https://shavtzak.site/login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[type="email"]', 'admin@shavtzak.site');
  await page.fill('input[type="password"]', 'Admin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log(`Logged in: ${page.url()}\n`);

  // Capture network responses that might return JSONB objects
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/') && resp.status() === 200) {
      try {
        const body = await resp.json().catch(() => null);
        if (!body) return;
        // Check for objects in name fields
        const check = (obj, path) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach((item, i) => check(item, `${path}[${i}]`));
          } else {
            for (const [key, val] of Object.entries(obj)) {
              if (key === 'name' && val && typeof val === 'object' && !Array.isArray(val)) {
                console.log(`⚠️  JSONB name found at ${path}.name = ${JSON.stringify(val).slice(0, 100)}`);
              }
              if (typeof val === 'object') check(val, `${path}.${key}`);
            }
          }
        };
        const shortUrl = resp.url().split('/api/v1/')[1] || resp.url();
        check(body, shortUrl);
      } catch {}
    }
  });

  // Now reload dashboard
  console.log('Reloading dashboard...');
  await page.goto('https://shavtzak.site/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(5000);
  
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 100));
  console.log(`\nPage content: ${bodyText}`);
  
  await browser.close();
}

run().catch(e => console.error(e));
