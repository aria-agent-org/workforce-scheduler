const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/tmp/screenshots3';
const BASE = 'https://shavtzak.site';

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    locale: 'he-IL',
    viewport: { width: 1440, height: 900 },
  });
  
  const page = await context.newPage();

  // Login and get token
  console.log('🔐 Logging in...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  
  // Fill login
  const emailInput = await page.$('input[type="email"]') || await page.$('input[name="email"]') || await page.$('input[placeholder*="mail"]');
  const passInput = await page.$('input[type="password"]');
  
  if (emailInput && passInput) {
    await emailInput.fill('admin@shavtzak.site');
    await passInput.fill('Admin123!');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '00_login_filled.png') });
    
    // Submit
    const submitBtn = await page.$('button[type="submit"]') || await page.$('button:has-text("התחבר")') || await page.$('button:has-text("כניסה")');
    if (submitBtn) await submitBtn.click();
    
    await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  
  console.log(`  Current URL: ${page.url()}`);
  
  // Inject token into localStorage as backup
  const token = await page.evaluate(() => localStorage.getItem('access_token') || localStorage.getItem('token'));
  console.log(`  Token in storage: ${token ? 'YES' : 'NO'}`);
  
  // Check if we're actually on dashboard
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  console.log(`  Page content: ${bodyText.slice(0, 100)}...`);

  // Take screenshot of current state
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_after_login.png') });

  // Navigate to pages WITHOUT full reload - use SPA navigation
  const pages = [
    ['dashboard', 'Dashboard'],
    ['scheduling', 'Scheduling'],
    ['employees', 'Employees'],
    ['attendance', 'Attendance'],
    ['settings', 'Settings'],
    ['admin', 'Admin'],
    ['analytics', 'Analytics'],
    ['rules', 'Rules'],
  ];

  for (const [route, label] of pages) {
    console.log(`\n📄 ${label}:`);
    
    // Navigate via SPA router (click links or use pushState)
    await page.evaluate((r) => {
      window.history.pushState({}, '', `/${r}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    await page.waitForTimeout(2000);
    
    // Check if page loaded
    const text = await page.evaluate(() => document.body.innerText.slice(0, 100));
    const hasError = text.includes('Something went wrong') || text.includes('משהו השתבש');
    
    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${label.toLowerCase()}_desktop.png`) });
    console.log(`  desktop: ${hasError ? '❌ error page' : '✅ OK'}`);
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${label.toLowerCase()}_mobile.png`) });
    console.log(`  mobile: ✅`);
  }

  // Also try direct navigation (full page reload) for key pages
  console.log('\n\n🔄 Direct navigation test (full reload):');
  for (const route of ['dashboard', 'scheduling', 'settings']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => document.body.innerText.slice(0, 100));
    const hasError = text.includes('Something went wrong') || text.includes('משהו השתבש');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `reload_${route}.png`) });
    console.log(`  ${route}: ${hasError ? '❌ error/redirect' : '✅ content loaded'} — ${text.slice(0, 50)}`);
  }

  console.log(`\n📸 ${fs.readdirSync(SCREENSHOTS_DIR).length} screenshots saved`);
  await browser.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
