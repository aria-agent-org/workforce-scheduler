const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/tmp/screenshots';
const BASE = 'https://shavtzak.site';

// Viewports to test
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },    // iPhone
  { name: 'tablet', width: 768, height: 1024 },    // iPad
  { name: 'desktop', width: 1440, height: 900 },   // Desktop
];

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    locale: 'he-IL',
  });
  
  const page = await context.newPage();
  const issues = [];
  let totalChecks = 0;
  let passedChecks = 0;

  // Helper: take screenshot at different viewports
  async function screenshotPage(pagePath, label) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const filename = `${label.replace(/[^a-z0-9]/gi, '_')}_${vp.name}.png`;
      try {
        await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(500); // Let animations settle
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: false });
        console.log(`  📸 ${label} (${vp.name}) — OK`);
      } catch (e) {
        console.log(`  ⚠️  ${label} (${vp.name}) — ${e.message.slice(0, 80)}`);
      }
    }
  }

  // Helper: check for UI issues
  async function checkPage(pagePath, label) {
    totalChecks++;
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      const response = await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      
      // Check for React errors
      const errorOverlay = await page.$('.react-error-overlay, [data-testid="error-boundary"]');
      if (errorOverlay) {
        issues.push(`❌ ${label}: React error overlay visible`);
        return;
      }

      // Check for blank page (no content)
      const bodyText = await page.evaluate(() => document.body.innerText.trim().length);
      if (bodyText < 10) {
        issues.push(`❌ ${label}: Page appears blank (${bodyText} chars)`);
        return;
      }

      // Check for JS console errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          consoleErrors.push(msg.text().slice(0, 100));
        }
      });

      // Check for horizontal overflow (mobile)
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
      });
      
      if (hasHorizontalScroll) {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        issues.push(`⚠️  ${label}: Horizontal scroll on mobile (${scrollWidth}px > 375px)`);
      }

      // Check for elements overflowing viewport on mobile
      const overflowingElements = await page.evaluate(() => {
        const vw = window.innerWidth;
        const overflows = [];
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > vw + 10 && rect.width > 10) {
            const tag = el.tagName.toLowerCase();
            const cls = el.className?.toString().slice(0, 40) || '';
            overflows.push(`${tag}.${cls}`);
          }
        });
        return [...new Set(overflows)].slice(0, 3);
      });

      if (overflowingElements.length > 0) {
        issues.push(`⚠️  ${label}: Elements overflow on mobile: ${overflowingElements.join(', ')}`);
      }

      // Check clickable elements are big enough on mobile
      const smallButtons = await page.evaluate(() => {
        const small = [];
        document.querySelectorAll('button, a, [role="button"], input[type="submit"]').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.height > 0 && rect.height < 30 && rect.width > 0 && rect.width < 30) {
            small.push(`${el.tagName}(${rect.width.toFixed(0)}x${rect.height.toFixed(0)})`);
          }
        });
        return [...new Set(small)].slice(0, 5);
      });

      if (smallButtons.length > 0) {
        issues.push(`⚠️  ${label}: Small touch targets on mobile: ${smallButtons.join(', ')}`);
      }

      passedChecks++;
      console.log(`  ✅ ${label}`);

    } catch (e) {
      issues.push(`❌ ${label}: ${e.message.slice(0, 100)}`);
      console.log(`  ❌ ${label}: ${e.message.slice(0, 80)}`);
    }
  }

  // === LOGIN ===
  console.log('\n🔐 Login Flow...');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_login.png') });
  
  // Fill login form
  try {
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="אימייל"], input[placeholder*="email"]', 'admin@shavtzak.site');
    await page.fill('input[type="password"], input[name="password"]', 'Admin123!');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_login_filled.png') });
    
    await page.click('button[type="submit"], button:has-text("התחבר"), button:has-text("כניסה")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_after_login.png') });
    
    const url = page.url();
    if (url.includes('login')) {
      console.log('  ⚠️  Still on login page after submit');
      // Try to check for error message
      const errorMsg = await page.textContent('.text-red-500, .text-red-600, [role="alert"]').catch(() => null);
      if (errorMsg) console.log(`  Error: ${errorMsg}`);
    } else {
      console.log(`  ✅ Logged in — redirected to ${url}`);
    }
  } catch (e) {
    console.log(`  ⚠️  Login form interaction failed: ${e.message.slice(0, 80)}`);
    // Try direct navigation with cookie
  }

  // === AUTHENTICATED PAGES ===
  console.log('\n📄 Page Checks (authenticated)...');
  
  const pages = [
    ['/dashboard', 'Dashboard'],
    ['/scheduling', 'Scheduling'],
    ['/employees', 'Employees'],
    ['/attendance', 'Attendance'],
    ['/rules', 'Rules'],
    ['/settings', 'Settings'],
    ['/settings?tab=board-template', 'Board Template Editor'],
    ['/settings?tab=google-sheets', 'Google Sheets'],
    ['/settings?tab=work-roles', 'Work Roles'],
    ['/settings?tab=channels', 'Channels'],
    ['/settings?tab=features', 'Features'],
    ['/settings?tab=security', 'Security'],
    ['/admin', 'Admin Panel'],
    ['/analytics', 'Analytics'],
    ['/reports', 'Reports'],
    ['/notifications', 'Notifications'],
    ['/chat', 'Chat'],
    ['/audit', 'Audit Log'],
    ['/my/schedule', 'My Schedule'],
    ['/my/profile', 'My Profile'],
    ['/kiosk', 'Kiosk'],
    ['/help', 'Help'],
    ['/webhooks', 'Webhooks'],
    ['/swaps', 'Swap Requests'],
  ];

  for (const [pagePath, label] of pages) {
    await checkPage(pagePath, label);
  }

  // === SCREENSHOTS AT ALL VIEWPORTS ===
  console.log('\n📱 Responsive Screenshots...');
  const keyPages = [
    ['/dashboard', 'dashboard'],
    ['/scheduling', 'scheduling'],
    ['/settings?tab=board-template', 'board_editor'],
    ['/employees', 'employees'],
    ['/my/schedule', 'my_schedule'],
  ];
  
  for (const [pagePath, label] of keyPages) {
    await screenshotPage(pagePath, label);
  }

  // === SUMMARY ===
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   🧪 VISUAL TEST RESULTS                    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nPages checked: ${totalChecks}`);
  console.log(`Passed: ${passedChecks}`);
  console.log(`Issues: ${issues.length}`);
  
  if (issues.length > 0) {
    console.log('\n--- Issues Found ---');
    for (const issue of issues) {
      console.log(`  ${issue}`);
    }
  } else {
    console.log('\n✅ No issues found!');
  }
  
  console.log(`\n📸 Screenshots saved to: ${SCREENSHOTS_DIR}/`);
  console.log(`   Total files: ${fs.readdirSync(SCREENSHOTS_DIR).length}`);
  
  await browser.close();
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
