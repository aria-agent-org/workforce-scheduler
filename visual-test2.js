const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/tmp/screenshots2';
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
  const issues = [];

  // Login first
  console.log('🔐 Logging in...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="אימייל"], input[placeholder*="email"]', 'admin@shavtzak.site');
  await page.fill('input[type="password"], input[name="password"]', 'Admin123!');
  await page.click('button[type="submit"], button:has-text("התחבר"), button:has-text("כניסה")');
  await page.waitForTimeout(3000);
  console.log(`  → ${page.url()}`);

  // Now take screenshots of key pages at 3 viewports
  const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  const pages = [
    ['/dashboard', 'dashboard'],
    ['/scheduling', 'scheduling'],
    ['/employees', 'employees'],
    ['/attendance', 'attendance'],
    ['/settings', 'settings'],
    ['/settings?tab=board-template', 'board_editor'],
    ['/settings?tab=google-sheets', 'google_sheets'],
    ['/admin', 'admin'],
    ['/analytics', 'analytics'],
    ['/rules', 'rules'],
    ['/my/schedule', 'my_schedule'],
    ['/my/profile', 'my_profile'],
  ];

  for (const [pagePath, label] of pages) {
    console.log(`\n📄 ${label}:`);
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const filename = `${label}_${vp.name}.png`;
      try {
        await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);
        
        // Check for error boundary
        const errorText = await page.textContent('body').catch(() => '');
        const hasError = errorText.includes('Something went wrong') || errorText.includes('שגיאה');
        
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: false });
        
        if (hasError && errorText.length < 200) {
          console.log(`  ❌ ${vp.name}: Error page detected`);
          issues.push(`${label} (${vp.name}): Shows error page`);
        } else {
          // Check for horizontal overflow on mobile
          if (vp.name === 'mobile') {
            const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
            if (scrollW > vp.width + 5) {
              console.log(`  ⚠️  ${vp.name}: H-scroll (${scrollW}px > ${vp.width}px)`);
              issues.push(`${label} (mobile): Horizontal scroll ${scrollW}px`);
            } else {
              console.log(`  ✅ ${vp.name}`);
            }
          } else {
            console.log(`  ✅ ${vp.name}`);
          }
        }
      } catch (e) {
        console.log(`  ❌ ${vp.name}: ${e.message.slice(0, 60)}`);
        issues.push(`${label} (${vp.name}): ${e.message.slice(0, 60)}`);
      }
    }
  }

  console.log('\n\n════════════════════════════════');
  console.log(`Issues: ${issues.length}`);
  for (const i of issues) console.log(`  • ${i}`);
  console.log(`Screenshots: ${fs.readdirSync(SCREENSHOTS_DIR).length} files in ${SCREENSHOTS_DIR}`);
  
  await browser.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
