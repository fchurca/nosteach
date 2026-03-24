const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';

let NSEC = process.env.TEST_NSEC;
if (!NSEC && fs.existsSync('.secrets')) {
  const secrets = fs.readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC=(.+)/);
  if (match) NSEC = match[1];
}
if (!NSEC) {
  console.error('ERROR: TEST_NSEC must be defined in .secrets or TEST_NSEC env var');
  process.exit(1);
}

async function exploreSite() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  const results = { pages: {}, screenshots: [] };

  async function takeScreenshot(name) {
    const filename = `/var/lib/opencode/workspace/lightning-starter/screenshots/${name}.png`;
    try {
      await page.screenshot({ path: filename, fullPage: true });
      results.screenshots.push(filename);
      console.log(`Screenshot: ${name}`);
    } catch (e) {
      console.log(`Screenshot failed: ${name} - ${e.message}`);
    }
  }

  const { mkdirSync, writeFileSync, existsSync } = require('fs');
  if (!existsSync('/var/lib/opencode/workspace/lightning-starter/screenshots')) {
    mkdirSync('/var/lib/opencode/workspace/lightning-starter/screenshots', { recursive: true });
  }

  async function safeGoto(url, options = {}) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000, ...options });
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log(`Navigation error: ${e.message}`);
    }
  }

  async function safeClick(selector, options = {}) {
    try {
      await page.click(selector, { timeout: 5000, ...options });
      await page.waitForTimeout(1000);
      return true;
    } catch (e) {
      console.log(`Click failed for ${selector}: ${e.message.split('\n')[0]}`);
      return false;
    }
  }

  try {
    // 1. Home Page
    console.log('\n=== 1. HOME PAGE ===');
    await safeGoto(BASE_URL);
    await takeScreenshot('01_home');
    results.pages.home = {
      url: page.url(),
      title: await page.title(),
      h1Text: await page.$eval('h1', el => el.textContent).catch(() => 'No H1'),
      buttons: await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t)),
      navItems: await page.$$eval('nav a, header a', items => items.map(i => i.textContent.trim()))
    };
    console.log(`  Title: ${results.pages.home.title}`);
    console.log(`  H1: ${results.pages.home.h1Text}`);

    // 2. Login Flow
    console.log('\n=== 2. LOGIN FLOW ===');
    // Try to find and click login button
    const loginSelectors = ['text=/iniciar sesi[oó]n/i', 'text=/entrar/i', 'button:has-text("Iniciar")', '[data-testid*="login"]'];
    for (const sel of loginSelectors) {
      if (await page.$(sel)) {
        await safeClick(sel);
        await takeScreenshot('02_login_form');
        break;
      }
    }

    // Try to find Nostr/NIP-07 extension login
    const nostrSelectors = ['text=/nostr/i', '[data-testid*="nostr"]', 'button:has-text("Conectar")'];
    for (const sel of nostrSelectors) {
      if (await page.$(sel)) {
        await safeClick(sel);
        await takeScreenshot('03_nostr_trigger');
        break;
      }
    }

    // Fill nsec if input exists
    const nsecInput = await page.$('input[placeholder*="nsec"], textarea[placeholder*="nsec"], input[type="password"]');
    if (nsecInput) {
      await nsecInput.fill(NSEC);
      await takeScreenshot('04_nsec_filled');
    }

    // Submit
    await safeClick('button[type="submit"], button:has-text("Enviar"), button:has-text("Iniciar")');
    await page.waitForTimeout(3000);
    await takeScreenshot('05_after_login');
    results.pages.afterLogin = { url: page.url() };

    // 3. Courses List
    console.log('\n=== 3. COURSES LIST ===');
    await safeGoto(`${BASE_URL}/courses`);
    await takeScreenshot('06_courses_list');
    const courseCards = await page.$$('[class*="course"], [class*="card"], article');
    results.pages.courses = {
      url: page.url(),
      courseCount: courseCards.length,
      buttons: await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t)),
      filters: await page.$$eval('select', s => s.map(s => s.name || s.id || 'select'))
    };
    console.log(`  Courses found: ${courseCards.length}`);

    // 4. Course Detail
    console.log('\n=== 4. COURSE DETAIL ===');
    const firstCourse = await page.$('a[href*="/course/"], a[href*="/courses/"]');
    if (firstCourse) {
      await firstCourse.click();
      await page.waitForTimeout(2000);
      await takeScreenshot('07_course_detail');
      results.pages.courseDetail = {
        url: page.url(),
        h1: await page.$eval('h1', el => el.textContent).catch(() => 'No H1')
      };
    } else {
      await safeGoto(`${BASE_URL}/course/1`);
      await takeScreenshot('07_course_detail_direct');
    }

    // 5. Course Creation Form
    console.log('\n=== 5. COURSE CREATION FORM ===');
    await safeGoto(`${BASE_URL}/courses/create`);
    await takeScreenshot('08_course_create_form');
    results.pages.createForm = {
      url: page.url(),
      formFields: await page.$$eval('input, textarea, select', fields => fields.map(f => ({
        type: f.type || f.tagName,
        name: f.name,
        placeholder: f.placeholder
      }))),
      buttons: await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t))
    };
    console.log(`  Form fields: ${results.pages.createForm.formFields.length}`);

    // 6. User Account Page
    console.log('\n=== 6. ACCOUNT PAGE ===');
    await safeGoto(`${BASE_URL}/account`);
    await takeScreenshot('09_account_page');
    results.pages.account = {
      url: page.url(),
      h1: await page.$eval('h1', el => el.textContent).catch(() => 'No H1'),
      sections: await page.$$eval('h2, section', els => els.map(e => e.textContent.substring(0, 50)))
    };

    // 7. Roles Page
    console.log('\n=== 7. ROLES PAGE ===');
    await safeGoto(`${BASE_URL}/roles`);
    await takeScreenshot('10_roles_page');
    results.pages.roles = {
      url: page.url(),
      h1: await page.$eval('h1', el => el.textContent).catch(() => 'No H1'),
      content: await page.$$eval('h2, p, button', els => els.map(e => e.textContent.substring(0, 80)))
    };

    // 8. Back to home - interactive elements
    console.log('\n=== 8. INTERACTIVE ELEMENTS ===');
    await safeGoto(BASE_URL);
    await takeScreenshot('11_home_complete');

    const allButtons = await page.$$eval('button', btns => btns.map(b => ({
      text: b.textContent.trim(),
      disabled: b.disabled
    })));
    const allLinks = await page.$$eval('a[href]', links => links.map(l => ({
      text: l.textContent.trim(),
      href: l.getAttribute('href')
    })));

    results.pages.interactiveElements = { buttons: allButtons, links: allLinks };
    console.log(`  Buttons: ${allButtons.length}, Links: ${allLinks.length}`);

    // 9. Check loading/error states
    console.log('\n=== 9. STATES ===');
    const loadingEl = await page.$$('[class*="loading"], [class*="skeleton"], [class*="spinner"]');
    const emptyEl = await page.$$('[class*="empty"], [class*="no-data"]');
    const errorEl = await page.$$('[class*="error"], [role="alert"]');
    results.pages.states = {
      loadingElements: loadingEl.length,
      emptyElements: emptyEl.length,
      errorElements: errorEl.length
    };

  } catch (error) {
    console.error('\nError:', error.message);
    results.error = error.message;
  }

  await browser.close();

  writeFileSync('/var/lib/opencode/workspace/lightning-starter/exploration_results.json', JSON.stringify(results, null, 2));
  console.log('\n=== EXPLORATION COMPLETE ===');
  console.log(`Screenshots: ${results.screenshots.length}`);
  return results;
}

exploreSite().catch(console.error);
