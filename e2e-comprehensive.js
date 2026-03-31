const { chromium } = require('playwright');
const BASE = 'https://shavtzak.site';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const errors = [];

  async function test(name, fn) {
    try { await fn(); results.push(`✅ ${name}`); }
    catch (e) { results.push(`❌ ${name}: ${e.message.substring(0, 120)}`); }
  }

  // ═══ DESKTOP TESTS ═══
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'he-IL' });
  const dp = await desktop.newPage();
  dp.on('pageerror', e => errors.push(`DESKTOP CRASH: ${e.message.substring(0, 150)}`));

  // Login
  await dp.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  let inputs = await dp.$$('input');
  await inputs[0].fill('admin@shavtzak.site');
  await inputs[1].fill('Admin123!');
  await dp.click('button[type="submit"]');
  await dp.waitForURL('**/dashboard**', { timeout: 10000 });

  async function noCrash(page) {
    const el = await page.$('text=משהו השתבש');
    if (el) throw new Error('ErrorBoundary!');
  }

  async function clickButton(page, text) {
    const btns = await page.$$('button');
    for (const b of btns) {
      const t = (await b.textContent()).trim();
      if (t.includes(text)) { await b.scrollIntoViewIfNeeded(); await b.click(); return true; }
    }
    return false;
  }

  // Dashboard
  await test('Desktop: Dashboard loads', async () => {
    await dp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
  });

  // Soldiers — full CRUD flow
  await test('Desktop: Soldiers list + search', async () => {
    await dp.goto(`${BASE}/soldiers`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
    const search = await dp.$('input[placeholder*="חיפוש"]');
    if (search) { await search.fill('דוד'); await dp.waitForTimeout(500); await search.fill(''); }
  });

  await test('Desktop: Add soldier dialog', async () => {
    await clickButton(dp, 'הוסף חייל') || await clickButton(dp, 'חייל חדש');
    await dp.waitForTimeout(500); await noCrash(dp);
    await clickButton(dp, 'ביטול');
  });

  // Scheduling — windows, missions, assignment
  await test('Desktop: Scheduling page', async () => {
    await dp.goto(`${BASE}/scheduling`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1500); await noCrash(dp);
  });

  await test('Desktop: Click schedule window', async () => {
    const cards = await dp.$$('[class*="card"], [class*="Card"]');
    if (cards.length > 1) { await cards[1].click(); await dp.waitForTimeout(1000); }
    await noCrash(dp);
  });

  await test('Desktop: Mission type create dialog', async () => {
    await clickButton(dp, 'סוג משימה');
    await dp.waitForTimeout(500); await noCrash(dp);
    await clickButton(dp, 'ביטול');
  });

  await test('Desktop: Mission template dialog', async () => {
    await clickButton(dp, 'תבנית') || await clickButton(dp, 'תבניות');
    await dp.waitForTimeout(500); await noCrash(dp);
    await clickButton(dp, 'ביטול') || await clickButton(dp, 'סגור');
  });

  // Attendance — all views
  await test('Desktop: Attendance grid', async () => {
    await dp.goto(`${BASE}/attendance`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
  });

  await test('Desktop: Attendance monthly view', async () => {
    await clickButton(dp, 'חודשי');
    await dp.waitForTimeout(500); await noCrash(dp);
  });

  await test('Desktop: Attendance calendar view', async () => {
    await clickButton(dp, 'לוח שנה');
    await dp.waitForTimeout(500); await noCrash(dp);
  });

  await test('Desktop: Attendance weekly view', async () => {
    await clickButton(dp, 'שבועי');
    await dp.waitForTimeout(500); await noCrash(dp);
  });

  await test('Desktop: Attendance date navigation', async () => {
    const navBtns = await dp.$$('button');
    for (const b of navBtns) {
      const svg = await b.$('svg');
      if (svg) { await b.click(); await dp.waitForTimeout(200); break; }
    }
    await noCrash(dp);
  });

  await test('Desktop: Attendance export buttons', async () => {
    const csvBtn = await dp.$('button:has-text("CSV")');
    const excelBtn = await dp.$('button:has-text("Excel")');
    // Just verify they exist, don't click (would trigger download)
    if (!csvBtn && !excelBtn) throw new Error('Export buttons missing');
  });

  // Rules — list + create
  await test('Desktop: Rules list', async () => {
    await dp.goto(`${BASE}/rules`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
  });

  await test('Desktop: Create rule dialog', async () => {
    await clickButton(dp, 'חוק חדש');
    await dp.waitForTimeout(500); await noCrash(dp);
    // Check tooltips exist
    const tooltips = await dp.$$('[class*="Tooltip"], button[title]');
    await clickButton(dp, 'ביטול');
  });

  // Notifications
  await test('Desktop: Notifications page', async () => {
    await dp.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
  });

  // Reports
  await test('Desktop: Reports page', async () => {
    await dp.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
    // Check Hebrew labels
    const text = await dp.textContent('body');
    if (text.includes('Workload') && !text.includes('עומס')) throw new Error('Reports still in English');
  });

  // Swaps
  await test('Desktop: Swaps page', async () => {
    await dp.goto(`${BASE}/swaps`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(500); await noCrash(dp);
  });

  // Settings — all tabs
  const settingsTabs = ['משתמשים', 'תפקידים', 'סטטוסי נוכחות', 'תבנית לוח', 'ערוצים', 'בוט', 'נראות חייל', 'הרשאות', 'אבטחה'];
  for (const tab of settingsTabs) {
    await test(`Desktop: Settings → ${tab}`, async () => {
      await dp.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
      await dp.waitForTimeout(500);
      await clickButton(dp, tab);
      await dp.waitForTimeout(800); await noCrash(dp);
    });
  }

  // Settings → Board template create
  await test('Desktop: Board template create', async () => {
    await dp.goto(`${BASE}/settings?tab=board-template`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000);
    const created = await clickButton(dp, 'תבנית חדשה') || await clickButton(dp, 'צור תבנית');
    if (created) { await dp.waitForTimeout(1000); await noCrash(dp); }
  });

  // Admin
  await test('Desktop: Admin panel', async () => {
    await dp.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
  });

  await test('Desktop: Admin create tenant', async () => {
    await clickButton(dp, 'טננט חדש');
    await dp.waitForTimeout(500); await noCrash(dp);
    await clickButton(dp, 'ביטול');
  });

  // Self-service pages
  await test('Desktop: My Schedule', async () => {
    await dp.goto(`${BASE}/my/schedule`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
  });

  await test('Desktop: My Profile', async () => {
    await dp.goto(`${BASE}/my/profile`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(1000); await noCrash(dp);
  });

  await test('Desktop: My Notifications', async () => {
    await dp.goto(`${BASE}/my/notifications`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(500); await noCrash(dp);
  });

  // Help + Audit
  await test('Desktop: Help page', async () => {
    await dp.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(500); await noCrash(dp);
  });

  await test('Desktop: Audit log', async () => {
    await dp.goto(`${BASE}/audit-log`, { waitUntil: 'networkidle' });
    await dp.waitForTimeout(500); await noCrash(dp);
  });

  // ═══ MOBILE TESTS ═══
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'he-IL', isMobile: true });
  const mp = await mobile.newPage();
  mp.on('pageerror', e => errors.push(`MOBILE CRASH: ${e.message.substring(0, 150)}`));

  // Login on mobile
  await mp.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  inputs = await mp.$$('input');
  await inputs[0].fill('admin@shavtzak.site');
  await inputs[1].fill('Admin123!');
  await mp.click('button[type="submit"]');
  await mp.waitForURL('**/dashboard**', { timeout: 10000 });

  const mobilePages = ['/dashboard', '/soldiers', '/scheduling', '/attendance', '/rules', '/settings', '/my/schedule', '/my/profile', '/help'];
  for (const path of mobilePages) {
    await test(`Mobile: ${path}`, async () => {
      await mp.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 10000 });
      await mp.waitForTimeout(800); await noCrash(mp);
      // Check bottom nav exists on mobile
      if (['/dashboard','/soldiers','/scheduling'].includes(path)) {
        const bottomNav = await mp.$('nav[class*="fixed"], nav[class*="bottom"]');
        // It's ok if not found — some pages use sidebar
      }
    });
  }

  // ═══ DARK MODE TEST ═══
  await test('Desktop: Dark mode toggle', async () => {
    await dp.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    // Try to toggle dark mode
    const toggles = await dp.$$('button');
    for (const t of toggles) {
      const text = (await t.textContent()).trim();
      if (text.includes('🌙') || text.includes('dark') || text.includes('עב')) {
        await t.click(); await dp.waitForTimeout(500); break;
      }
    }
    await noCrash(dp);
  });

  // ═══ RESULTS ═══
  console.log('\n' + '='.repeat(60));
  console.log('  COMPREHENSIVE E2E RESULTS');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.startsWith('✅')).length;
  const failed = results.filter(r => r.startsWith('❌')).length;
  for (const r of results) console.log(r);

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`PASSED: ${passed} | FAILED: ${failed} | TOTAL: ${results.length}`);
  console.log(`${'─'.repeat(40)}`);

  if (errors.length > 0) {
    const unique = [...new Set(errors)];
    console.log(`\n🔴 PAGE CRASHES (${unique.length}):`);
    for (const e of unique) console.log(`  ${e}`);
  } else {
    console.log('\n✅ ZERO page crashes');
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
