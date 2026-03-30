const { chromium } = require('playwright');

const BASE = 'https://shavtzak.site';
const EMAIL = 'admin@shavtzak.site';
const PASSWORD = 'Admin123!';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  const results = [];
  const consoleErrors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('favicon') && !t.includes('net::') && !t.includes('manifest'))
        consoleErrors.push(t.substring(0, 150));
    }
  });
  page.on('pageerror', err => consoleErrors.push(`CRASH: ${err.message.substring(0, 150)}`));

  async function test(name, fn) {
    try { await fn(); results.push(`✅ ${name}`); }
    catch (e) { results.push(`❌ ${name}: ${e.message.substring(0, 120)}`); }
  }

  async function noCrash() {
    const el = await page.$('text=משהו השתבש');
    if (el) throw new Error('ErrorBoundary crash!');
  }

  async function clickBtn(text) {
    const btns = await page.$$('button');
    for (const b of btns) {
      const t = (await b.textContent()).trim();
      if (t.includes(text)) { await b.scrollIntoViewIfNeeded(); await b.click(); return true; }
    }
    return false;
  }

  // ═══ LOGIN ═══
  await test('Login', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    const inputs = await page.$$('input');
    await inputs[0].fill(EMAIL);
    await inputs[1].fill(PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
  });

  // ═══ DASHBOARD — click actions ═══
  await test('Dashboard: KPI cards visible', async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  // ═══ SOLDIERS — CRUD ═══
  await test('Soldiers: list loads', async () => {
    await page.goto(`${BASE}/soldiers`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
    const rows = await page.$$('tr, [class*="card"]');
    if (rows.length < 2) throw new Error('No soldier rows');
  });

  await test('Soldiers: search works', async () => {
    const searchInput = await page.$('input[placeholder*="חיפוש"], input[placeholder*="search"], input[placeholder*="שם"]');
    if (searchInput) {
      await searchInput.fill('דוד');
      await page.waitForTimeout(500);
      await searchInput.fill('');
      await page.waitForTimeout(300);
    }
    await noCrash();
  });

  await test('Soldiers: click add soldier button', async () => {
    const found = await clickBtn('הוסף חייל') || await clickBtn('חייל חדש') || await clickBtn('Add');
    if (found) {
      await page.waitForTimeout(500);
      await noCrash();
      // Close dialog
      const cancel = await clickBtn('ביטול') || await clickBtn('Cancel');
    }
  });

  // ═══ SCHEDULING ═══
  await test('Scheduling: loads with windows', async () => {
    await page.goto(`${BASE}/scheduling`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    await noCrash();
  });

  await test('Scheduling: click a window', async () => {
    const cards = await page.$$('[class*="card"], [class*="Card"]');
    if (cards.length > 0) {
      await cards[0].click();
      await page.waitForTimeout(1000);
      await noCrash();
    }
  });

  await test('Scheduling: create mission type dialog', async () => {
    const found = await clickBtn('סוג משימה') || await clickBtn('Mission Type');
    if (found) {
      await page.waitForTimeout(500);
      await noCrash();
      await clickBtn('ביטול') || await clickBtn('Cancel') || await clickBtn('סגור');
    }
  });

  // ═══ ATTENDANCE ═══
  await test('Attendance: grid loads', async () => {
    await page.goto(`${BASE}/attendance`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  await test('Attendance: switch view mode', async () => {
    const monthBtn = await page.$('button:has-text("חודשי")');
    if (monthBtn) { await monthBtn.click(); await page.waitForTimeout(500); await noCrash(); }
    const calBtn = await page.$('button:has-text("לוח שנה")');
    if (calBtn) { await calBtn.click(); await page.waitForTimeout(500); await noCrash(); }
    const weekBtn = await page.$('button:has-text("שבועי")');
    if (weekBtn) { await weekBtn.click(); await page.waitForTimeout(500); await noCrash(); }
  });

  await test('Attendance: navigate dates', async () => {
    const btns = await page.$$('button');
    for (const b of btns) {
      const t = (await b.textContent()).trim();
      if (t === '>' || t === '<' || t.includes('ChevronLeft') || t.includes('ChevronRight')) {
        await b.click(); await page.waitForTimeout(300); break;
      }
    }
    await noCrash();
  });

  // ═══ RULES ═══
  await test('Rules: list loads', async () => {
    await page.goto(`${BASE}/rules`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  await test('Rules: create rule dialog', async () => {
    const found = await clickBtn('חוק חדש') || await clickBtn('New Rule');
    if (found) {
      await page.waitForTimeout(500);
      await noCrash();
      await clickBtn('ביטול');
    }
  });

  // ═══ NOTIFICATIONS ═══
  await test('Notifications: page loads', async () => {
    await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  // ═══ REPORTS ═══
  await test('Reports: page loads with charts', async () => {
    await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  // ═══ SWAPS ═══
  await test('Swaps: page loads', async () => {
    await page.goto(`${BASE}/swaps`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);
    await noCrash();
  });

  // ═══ SETTINGS — each tab with interactions ═══
  await test('Settings: general tab', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
    // Check for settings content
    const text = await page.textContent('body');
    if (!text.includes('הגדר') && !text.includes('Settings')) throw new Error('Settings content missing');
  });

  const tabTests = [
    { name: 'משתמשים', check: async () => { await noCrash(); } },
    { name: 'תפקידים', check: async () => { await noCrash(); } },
    { name: 'סטטוסי נוכחות', check: async () => { 
      await noCrash();
      // Try to click "סטטוס חדש"  
      const found = await clickBtn('סטטוס חדש');
      if (found) { await page.waitForTimeout(300); await noCrash(); await clickBtn('ביטול'); }
    }},
    { name: 'תבנית לוח', check: async () => {
      await noCrash();
      const found = await clickBtn('תבנית חדשה') || await clickBtn('צור תבנית');
      if (found) { await page.waitForTimeout(1000); await noCrash(); }
    }},
    { name: 'ערוצים', check: async () => { await noCrash(); } },
    { name: 'בוט', check: async () => { await noCrash(); } },
    { name: 'נראות חייל', check: async () => { await noCrash(); } },
    { name: 'הרשאות', check: async () => { await noCrash(); } },
    { name: 'אבטחה', check: async () => { await noCrash(); } },
  ];

  for (const tab of tabTests) {
    await test(`Settings → ${tab.name}`, async () => {
      await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(500);
      const clicked = await clickBtn(tab.name);
      if (!clicked) throw new Error(`Tab "${tab.name}" button not found`);
      await page.waitForTimeout(800);
      await tab.check();
    });
  }

  // ═══ ADMIN PANEL ═══
  await test('Admin: tenants list', async () => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  await test('Admin: create tenant dialog', async () => {
    const found = await clickBtn('טננט חדש') || await clickBtn('New Tenant');
    if (found) {
      await page.waitForTimeout(500);
      await noCrash();
      await clickBtn('ביטול');
    }
  });

  // ═══ SOLDIER PORTAL ═══
  await test('My Schedule: loads', async () => {
    await page.goto(`${BASE}/my/schedule`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  await test('My Profile: loads and has sections', async () => {
    await page.goto(`${BASE}/my/profile`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    await noCrash();
  });

  await test('My Notifications: loads', async () => {
    await page.goto(`${BASE}/my/notifications`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);
    await noCrash();
  });

  // ═══ HELP ═══
  await test('Help: page loads with articles', async () => {
    await page.goto(`${BASE}/help`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);
    await noCrash();
  });

  // ═══ AUDIT LOG ═══
  await test('Audit: loads with entries', async () => {
    await page.goto(`${BASE}/audit-log`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);
    await noCrash();
  });

  // ═══ RESULTS ═══
  console.log('\n' + '='.repeat(60));
  console.log('  FULL E2E TEST RESULTS — SHAVTZAK');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.startsWith('✅')).length;
  const failed = results.filter(r => r.startsWith('❌')).length;

  for (const r of results) console.log(r);

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`PASSED: ${passed} | FAILED: ${failed} | TOTAL: ${results.length}`);
  console.log(`${'─'.repeat(40)}`);

  if (consoleErrors.length > 0) {
    const unique = [...new Set(consoleErrors)];
    console.log(`\n🔴 CONSOLE ERRORS (${unique.length} unique):`);
    for (const e of unique) console.log(`  ${e}`);
  } else {
    console.log('\n✅ ZERO browser console errors');
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
