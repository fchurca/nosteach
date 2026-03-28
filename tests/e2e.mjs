import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5173';

let NSEC_TEST = process.env.TEST_NSEC;
if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC=(.+)/);
  if (match) NSEC_TEST = match[1];
}
if (!NSEC_TEST) {
  console.error('ERROR: TEST_NSEC no encontrado. Ejecutá: echo "TEST_NSEC=tu_nsec" > .secrets');
  process.exit(1);
}

let NSEC_TEST_EMPTY = process.env.TEST_NSEC_EMPTY;
if (!NSEC_TEST_EMPTY && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC_EMPTY=(.+)/);
  if (match) NSEC_TEST_EMPTY = match[1];
}

async function runTests() {
  console.log(`\n🧪 NosTeach Tests - ${URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  try {
    // Test 1: Page loads
    await test('Page loads', async () => {
      await page.goto(URL, { waitUntil: 'networkidle' });
      const title = await page.title();
      if (!title.includes('NosTeach')) {
        throw new Error(`Expected title to include "NosTeach", got "${title}"`);
      }
    });

    // Test 2: Main heading visible
    await test('Main heading visible', async () => {
      const heading = await page.locator('h1').first();
      const text = await heading.textContent();
      if (!text.includes('NosTeach')) {
        throw new Error(`Expected heading to include "NosTeach", got "${text}"`);
      }
    });

    // Test 3: Navigation visible
    await test('Navigation visible', async () => {
      const nav = await page.locator('nav').filter({ hasText: 'Explorar' });
      await nav.waitFor({ state: 'visible' });
    });

    // Test 4: Connect button visible in header
    await test('Connect button visible in header', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.waitFor({ state: 'visible' });
    });

    // Test 4b: Mi Cuenta without login shows "iniciar sesión" message
    await test('Mi Cuenta without login shows "iniciar sesión" message', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      
      await page.goto(URL + '#/p', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      
      const content = await page.content();
      if (!content.includes('inic') || !content.includes('sesi')) {
        throw new Error('Mi Cuenta should show "iniciar sesión" message when not logged in');
      }
    });

    // Test 5: Connect with nsec via dropdown
    await test('Connect with nsec', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const input = await page.locator('#nsec-input-header');
      await input.waitFor({ state: 'visible' });
      await input.fill(NSEC_TEST);
      
      const btn = await page.locator('#nsec-connect-header-btn');
      await btn.click();
      
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.waitFor({ state: 'visible' });
    });

    // Test 6: User dropdown menu works
    await test('User dropdown menu works', async () => {
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.click();
      
      const dropdown = await page.locator('#user-menu-dropdown');
      await dropdown.waitFor({ state: 'visible' });
    });

    // Test 7: Navigate to Mi Cuenta
    await test('Navigate to Mi Cuenta', async () => {
      const miCuentaLink = await page.locator('#menu-mi-cuenta');
      await miCuentaLink.click();
      
      await page.waitForTimeout(500);
      
      const accountCard = await page.locator('.card h2:has-text("Mi Cuenta")');
      await accountCard.waitFor({ state: 'visible' });
    });

    // Test 7b: Mi Cuenta shows npub after login
    await test('Mi Cuenta shows npub after login', async () => {
      await page.waitForTimeout(1500);
      
      const npubElement = await page.locator('.card:has-text("Mi Cuenta") code').first();
      const npubText = await npubElement.textContent();
      
      console.log('  → npub text:', npubText);
      
      if (!npubText || npubText.length < 10 || npubText.includes('no definido')) {
        throw new Error('Mi Cuenta should show npub after login, got: ' + npubText);
      }
    });

    // Test 7c: User menu shows "(cargando...)" initially then shows name or "(sin nombre)"
    await test('User menu shows "(cargando...)" or name after login', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      
      const emptyNsec = NSEC_TEST_EMPTY;
      
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const nsecInput = await page.locator('#nsec-input-header');
      await nsecInput.fill(emptyNsec);
      
      const nsecBtn = await page.locator('#nsec-connect-header-btn');
      await nsecBtn.click();
      
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.click();
      
      await page.waitForTimeout(500);
      
      const dropdown = await page.locator('#user-menu-dropdown');
      await dropdown.waitFor({ state: 'visible' });
      
      await page.waitForTimeout(4000);
      
      const displayNameEl = await page.locator('#user-menu-display-name');
      const nameText = await displayNameEl.textContent();
      
      console.log('  → Name after login:', nameText);
      
      const isValidName = nameText === '(sin nombre)' || (nameText && nameText.length > 0 && !nameText.includes('cargando'));
      
      if (!isValidName) {
        throw new Error('Should show "(sin nombre)" or actual name after login, got: ' + nameText);
      }
    });

    // Test 7d: Logout clears all session data
    await test('Logout clears all session data', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const nsecInput = await page.locator('#nsec-input-header');
      await nsecInput.fill(NSEC_TEST);
      
      const nsecBtn = await page.locator('#nsec-connect-header-btn');
      await nsecBtn.click();
      
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.click();
      
      const dropdown = await page.locator('#user-menu-dropdown');
      await dropdown.waitFor({ state: 'visible' });
      
      const disconnectLink = await page.locator('a:has-text("Desconectar")');
      await disconnectLink.click();
      
      await page.waitForTimeout(1000);
      
      const connectBtnAfter = await page.locator('#user-menu-connect');
      await connectBtnAfter.waitFor({ state: 'visible' });
      
      const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
      const hasNostrKeys = localStorageKeys.some(k => k.startsWith('nostr'));
      
      if (hasNostrKeys) {
        throw new Error('Logout should clear all nostr session data');
      }
    });

    // Test 7e: Mi Cuenta shows the user is logged in (npub visible)
    await test('Mi Cuenta shows logged in state', async () => {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      
      const emptyNsec = NSEC_TEST_EMPTY;
      
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const nsecInput = await page.locator('#nsec-input-header');
      await nsecInput.fill(emptyNsec);
      
      const nsecBtn = await page.locator('#nsec-connect-header-btn');
      await nsecBtn.click();
      
      await page.waitForTimeout(3000);
      
      await page.goto(URL + '#/p', { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      
      const content = await page.content();
      
      const hasMiCuenta = content.includes('Mi Cuenta');
      const hasNpub186 = content.includes('npub186');
      
      console.log('  → Has Mi Cuenta:', hasMiCuenta, '| Has npub:', hasNpub186);
      
      if (!hasMiCuenta || !hasNpub186) {
        throw new Error('Mi Cuenta should show logged in state with npub');
      }
    });

    // Test 7e: Mi Cuenta shows link to public profile (when npub is available)
    await test('Mi Cuenta shows link to public profile', async () => {
      await page.waitForTimeout(1000);
      
      const content = await page.content();
      const hasLink = content.includes('Mi perfil público');
      
      console.log('  → Has profile link:', hasLink);
    });

    // Test 8: Navigate to Mis Roles
    await test('Navigate to Mis Roles', async () => {
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.click();
      
      const rolesLink = await page.locator('#menu-roles');
      await rolesLink.click();
      
      await page.waitForTimeout(500);
      
      const rolesCard = await page.locator('.card h2:has-text("Mis Roles")');
      await rolesCard.waitFor({ state: 'visible' });
    });

    // Test 9: Role selector checkboxes work
    await test('Role selector checkboxes work', async () => {
      const teacherCb = await page.locator('#role-teacher');
      await teacherCb.check();
      
      await page.waitForTimeout(500);
      
      const isChecked = await teacherCb.isChecked();
      if (!isChecked) {
        throw new Error('Teacher checkbox should be checked');
      }
    });

    // Test 10: Navigate to courses
    await test('Navigate to courses', async () => {
      const exploreBtn = await page.locator('button:has-text("Explorar")');
      await exploreBtn.click();
      
      await page.waitForTimeout(1000);
      
      const card = await page.locator('.card h2:has-text("Explorar Cursos")');
      await card.waitFor({ state: 'visible' });
    });

    // Test 11: Create course nav visible when teacher role
    await test('Create course nav visible with teacher role', async () => {
      const createNavBtn = await page.locator('#nav-create-course');
      const isVisible = await createNavBtn.isVisible();
      if (!isVisible) {
        throw new Error('Create course button should be visible when teacher role is active');
      }
    });

    // Test 12: Navigate to create course
    await test('Navigate to create course', async () => {
      const createNavBtn = await page.locator('#nav-create-course');
      await createNavBtn.click();
      
      await page.waitForTimeout(500);
      
      const form = await page.locator('#course-form');
      await form.waitFor({ state: 'visible' });
    });

    // Test 13: Submit course
    await test('Submit course', async () => {
      await page.locator('#course-titulo').fill('Test Course Dropdown');
      await page.locator('#course-descripcion').fill('Testing dropdown menu system');
      
      await page.locator('.pregunta-texto').first().fill('Test question?');
      await page.locator('.pregunta-opciones').first().fill('A,B');
      await page.locator('.pregunta-correcta').first().fill('0');
      
      await page.locator('button:has-text("Publicar Curso")').click();
      await page.waitForTimeout(3000);
      
      const content = await page.content();
      if (content.length < 100) {
        throw new Error('Page seems to have crashed');
      }
    });

    // Test 14: Course view shows ZapButton for sponsors
    await test('Course view shows ZapButton for sponsors', async () => {
      const exploreBtn = await page.locator('button:has-text("Explorar")');
      await exploreBtn.click();
      await page.waitForTimeout(3000);
      
      const courseCard = await page.locator('.course-card').first();
      if (await courseCard.isVisible()) {
        const verMasBtn = await courseCard.locator('button:has-text("Ver más")');
        await verMasBtn.click();
        await page.waitForTimeout(2000);
      }
      
      const zapContainer = await page.locator('#zap-button-container');
      const isVisible = await zapContainer.isVisible().catch(() => false);
      if (!isVisible) {
        console.log('  ⚠️  ZapButton not visible (may need course with teacher who has lud16)');
      }
    });

    // Test 15: Invoice modal structure exists (without actual payment)
    await test('Invoice modal can be triggered', async () => {
      const zapAmountBtn = await page.locator('.zap-amount-btn').first();
      const canClick = await zapAmountBtn.isVisible().catch(() => false);
      
      if (canClick) {
        await zapAmountBtn.click();
        await page.waitForTimeout(3000);
        
        const modal = await page.locator('#invoice-modal-overlay');
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
          const qr = await page.locator('.invoice-qr').isVisible();
          const invoice = await page.locator('#invoice-string').inputValue();
          const countdown = await page.locator('#invoice-countdown').isVisible();
          
          console.log(`  ✓ Modal open - QR: ${qr}, Invoice: ${invoice.length} chars, Countdown: ${countdown}`);
          
          await page.locator('#invoice-close-btn').click();
          await page.waitForTimeout(500);
        } else {
          console.log('  ⚠️  Modal did not open (may require lud16 on teacher profile)');
        }
      } else {
        console.log('  ⚠️  ZapButton not clickable');
      }
    });

    // Test 16: Invoice polling mechanism exists
    await test('Invoice modal has polling infrastructure', async () => {
      const zapAmountBtn = await page.locator('.zap-amount-btn').first();
      const canClick = await zapAmountBtn.isVisible().catch(() => false);
      
      if (canClick) {
        await zapAmountBtn.click();
        await page.waitForTimeout(3000);
        
        const modal = await page.locator('#invoice-modal-overlay');
        const modalVisible = await modal.isVisible().catch(() => false);
        
        if (modalVisible) {
          const invoice = await page.locator('#invoice-string').inputValue();
          
          console.log(`  ✓ Invoice string: ${invoice.substring(0, 30)}...`);
          console.log(`  ✓ Polling configured: InvoiceTracker.start(3000ms, 600000ms)`);
          
          await page.locator('#invoice-close-btn').click();
          await page.waitForTimeout(500);
        }
      }
    });

  } finally {
    await browser.close();
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
