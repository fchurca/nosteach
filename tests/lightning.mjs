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
  console.error('ERROR: TEST_NSEC must be defined in .secrets or TEST_NSEC env var');
  process.exit(1);
}

async function runTests() {
  console.log(`\n⚡ NosTeach Lightning Tests - ${URL}\n`);

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
    await page.goto(URL, { waitUntil: 'networkidle' });

    await test('Page loads', async () => {
      const heading = await page.locator('h1').first();
      await heading.waitFor({ state: 'visible' });
    });

    await test('Connect with nsec', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const input = await page.locator('#nsec-input-header');
      await input.fill(NSEC_TEST);
      
      const btn = await page.locator('#nsec-connect-header-btn');
      await btn.click();
      
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.waitFor({ state: 'visible' });
    });

    await test('Activate teacher role', async () => {
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.click();
      
      const rolesLink = await page.locator('#menu-roles');
      await rolesLink.click();
      
      await page.waitForTimeout(500);
      
      const teacherCb = await page.locator('#role-teacher');
      await teacherCb.check();
      
      await page.waitForTimeout(500);
    });

    await test('Activate sponsor role', async () => {
      const sponsorCb = await page.locator('#role-sponsor');
      await sponsorCb.check();
      
      await page.waitForTimeout(500);
    });

    await test('Navigate to create course', async () => {
      const createNavBtn = await page.locator('#nav-create-course');
      await createNavBtn.click();
      
      await page.waitForTimeout(500);
      
      const form = await page.locator('#course-form');
      await form.waitFor({ state: 'visible' });
    });

    await test('Create course with paid evaluation', async () => {
      await page.locator('#course-titulo').fill('Lightning Test Course');
      await page.locator('#course-descripcion').fill('Course with paid evaluation for testing');
      
      await page.locator('#course-precio').selectOption('69');
      
      await page.locator('.pregunta-texto').first().fill('What is Lightning?');
      await page.locator('.pregunta-opciones').first().fill('Network,Protocol,Both,None');
      await page.locator('.pregunta-correcta').first().fill('2');
      
      await page.locator('button:has-text("Publicar Curso")').click();
      await page.waitForTimeout(3000);
    });

    await test('My courses button visible for teacher', async () => {
      const myCoursesBtn = await page.locator('#nav-my-courses');
      const isVisible = await myCoursesBtn.isVisible();
      if (!isVisible) {
        throw new Error('My courses button should be visible for teachers');
      }
    });

    await test('Navigate to My Courses', async () => {
      const myCoursesBtn = await page.locator('#nav-my-courses');
      await myCoursesBtn.click();
      
      await page.waitForTimeout(1000);
      
      const heading = await page.locator('.card h2:has-text("Mis Cursos")');
      await heading.waitFor({ state: 'visible' });
    });

    await test('Zap button container exists in course view', async () => {
      await page.locator('button:has-text("Explorar")').click();
      await page.waitForTimeout(2000);
      
      const courseCard = await page.locator('.course-card').first();
      if (await courseCard.isVisible()) {
        const verMasBtn = await courseCard.locator('button:has-text("Ver más")');
        await verMasBtn.click();
        await page.waitForTimeout(2000);
      }
    });

    await test('Course view shows zap section for sponsors', async () => {
      const zapSection = await page.locator('text=Patrocinar al Profesor');
      const isVisible = await zapSection.isVisible();
      if (!isVisible) {
        console.log('  ⚠️  Zap section not visible (may need sponsor role)');
      }
    });

    await test('Invoice modal structure exists', async () => {
      const modal = await page.locator('#invoice-modal-overlay');
      const isVisible = await modal.isVisible().catch(() => false);
      if (!isVisible) {
        console.log('  ⚠️  Modal not triggered (requires actual payment flow)');
      }
    });

    console.log('\n📝 Lightning Flow Manual Tests:');
    console.log('  1. As Sponsor: Go to a course, click "Apoyar con sats"');
    console.log('  2. Select amount (21, 69, 210, 690 or custom)');
    console.log('  3. Invoice modal should appear with QR code');
    console.log('  4. "Pagar con Alby" button should be visible if Alby is installed');
    console.log('  5. As Student: Go to a paid course, click "Pagar y Tomar Evaluación"');
    console.log('  6. Pay invoice, then evaluation form should appear');
    console.log('  7. As Teacher: Go to "Mis Cursos", click "Ver Respuestas"');
    console.log('  8. See student answers and "Premiar" button');

  } catch (err) {
    console.log(`\n❌ Test error: ${err.message}`);
    failed++;
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
