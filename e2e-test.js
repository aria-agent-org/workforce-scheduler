const { chromium } = require('playwright');

const BASE = 'https://shavtzak.site';
const EMAIL = 'admin@shavtzak.site';
const PASSWORD = 'Admin123!';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    locale: 'he-IL',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  const results = [];
  const consoleErrors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('manifest') && !text.includes('net::'))
        consoleErrors.push(text.substring(0, 200));
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`PAGE ERROR: ${err.message.substring(0, 200)}`);
  });

  async function test(name, fn) {
    try {
      await fn();
      results.push(`✅ ${name}`);
    } catch (e) {
      results.push(`❌ ${name}: ${e.message.substring(0, 150)}`);
    }
  }

  // === LOGIN ===
  await test('Login page loads', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('input', { timeout: 5000 });
  });

  await test('Login with admin', async () => {
    const inputs = await page.$$('input');
    await inputs[0].fill(EMAIL);
    await inputs[1].fill(PASSWORD);
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    else {
      const buttons = await page.$$('button');
      for (const b of buttons) {
        const text = await b.textContent();
        if (text && text.includes('כניסה')) { await b.click(); break; }
      }
    }
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
  });

  // === MAIN PAGES ===
  const mainPages = [
    '/dashboard', '/soldiers', '/scheduling', '/attendance',
    '/rules', '/reports', '/notifications', '/swaps',
    '/settings', '/audit-log', '/help',
    '/my/schedule', '/my/profile', '/my/notifications',
  ];

  for (const path of mainPages) {
    await test(`Page ${path}`, async () => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(500);
      const crash = await page.$('text=משהו השתבש');
      if (crash) throw new Error('ErrorBoundary crashed!');
      const body = await page.textContent('body');
      if (body.trim().length < 30) throw new Error('Page blank');
    });
  }

  // === SETTINGS TABS ===
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(1000);

  // Get all buttons in the settings page
  const allButtons = await page.$$('button');
  const tabTexts = [];
  for (const btn of allButtons) {
    const text = (await btn.textContent()).trim();
    if (text.length > 0 && text.length < 30) tabTexts.push(text);
  }

  const settingsTabs = ['משתמשים', 'תפקידים', 'סטטוסי נוכחות', 'תבנית לוח', 'ערוצים', 'בוט', 'הרשאות', 'אבטחה'];

  for (const tabName of settingsTabs) {
    await test(`Settings tab: ${tabName}`, async () => {
      await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(500);
      
      // Find and click the tab
      const buttons = await page.$$('button');
      let clicked = false;
      for (const btn of buttons) {
        const text = (await btn.textContent()).trim();
        if (text.includes(tabName)) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) throw new Error(`Tab button "${tabName}" not found`);
      
      await page.waitForTimeout(1000);
      const crash = await page.$('text=משהו השתבש');
      if (crash) throw new Error(`ErrorBoundary on tab "${tabName}"!`);
    });
  }

  // === BOARD TEMPLATE ===
  await test('Board template: navigate to tab', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = (await btn.textContent()).trim();
      if (text.includes('תבנית לוח')) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(1000);
    const crash = await page.$('text=משהו השתבש');
    if (crash) throw new Error('ErrorBoundary!');
  });

  await test('Board template: create new', async () => {
    const createBtns = await page.$$('button');
    let clicked = false;
    for (const btn of createBtns) {
      const text = (await btn.textContent()).trim();
      if (text.includes('תבנית חדשה') || text.includes('צור תבנית')) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) throw new Error('Create button not found');
    await page.waitForTimeout(1500);
    const crash = await page.$('text=משהו השתבש');
    if (crash) throw new Error('ErrorBoundary after create!');
  });

  await test('Board template: grid visible', async () => {
    const grid = await page.$('[style*="display: grid"], [style*="display:grid"]');
    if (!grid) throw new Error('Grid not visible');
  });

  await test('Board template: save', async () => {
    const saveBtns = await page.$$('button');
    for (const btn of saveBtns) {
      const text = (await btn.textContent()).trim();
      if (text.includes('שמור')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(2000);
    // Check for success toast or no error
    const crash = await page.$('text=משהו השתבש');
    if (crash) throw new Error('ErrorBoundary after save!');
  });

  // === SCHEDULING OPERATIONS ===
  await test('Scheduling: view missions', async () => {
    await page.goto(`${BASE}/scheduling`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    const crash = await page.$('text=משהו השתבש');
    if (crash) throw new Error('ErrorBoundary!');
  });

  // === PRINT RESULTS ===
  console.log('\n' + '='.repeat(60));
  console.log('  E2E TEST RESULTS — SHAVTZAK');
  console.log('='.repeat(60) + '\n');
  
  const passed = results.filter(r => r.startsWith('✅')).length;
  const failed = results.filter(r => r.startsWith('❌')).length;
  
  for (const r of results) console.log(r);
  
  console.log(`\n${'='.repeat(40)}`);
  console.log(`PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`${'='.repeat(40)}`);
  
  if (consoleErrors.length > 0) {
    console.log(`\nBROWSER CONSOLE ERRORS (${consoleErrors.length}):`);
    const unique = [...new Set(consoleErrors)];
    for (const e of unique) console.log(`  🔴 ${e}`);
  } else {
    console.log('\n✅ No browser console errors');
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
