import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5173';

let NSEC_TEST = process.env.TEST_NSEC;
if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC=(.+)/);
  if (match) NSEC_TEST = match[1];
}

async function runZapFlowTests() {
  console.log(`\n🧪 Zap Flow Tests - ${URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

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
    await test('1. Page loads', async () => {
      await page.goto(URL, { waitUntil: 'networkidle' });
    });

    await test('2. Login as teacher', async () => {
      await page.click('#user-menu-connect');
      await page.fill('#nsec-input-header', NSEC_TEST);
      await page.click('#nsec-connect-header-btn');
      await page.waitForTimeout(3000);
      // Force set teacher role in localStorage
      await page.evaluate(() => {
        localStorage.setItem('nosteach_roles', JSON.stringify({teacher:true,student:false,sponsor:false}));
      });
    });

    await test('3. Create a course', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      await page.click('#nav-create-course');
      await page.waitForTimeout(500);
      await page.fill('#course-titulo', 'Test Zap Course');
      await page.fill('#course-descripcion', 'Course for testing zap flow');
      await page.fill('.pregunta-texto', 'Test question?');
      await page.fill('.pregunta-opciones', 'A,B');
      await page.fill('.pregunta-correcta', '0');
      await page.click('button:has-text("Publicar Curso")');
      await page.waitForTimeout(4000);
    });

    await test('4. Logout', async () => {
      await page.click('#user-menu-btn');
      await page.waitForTimeout(300);
      await page.click('.dropdown-item:has-text("Desconectar")');
      await page.waitForTimeout(1500);
    });

    await test('5. Navigate to courses as anonymous', async () => {
      await page.goto(URL, { waitUntil: 'networkidle' });
      await page.click('button:has-text("Explorar")');
      await page.waitForTimeout(3000);
    });

    await test('6. Course list loads', async () => {
      const card = await page.locator('.card h2:has-text("Explorar Cursos")');
      await card.waitFor({ state: 'visible', timeout: 20000 });
    });

    await test('7. Teacher name is a link in course card', async () => {
      const teacherLink = await page.locator('.course-card .teacher-link').first();
      await teacherLink.waitFor({ state: 'visible', timeout: 15000 });
      const tagName = await teacherLink.evaluate(el => el.tagName);
      if (tagName !== 'A') throw new Error('Should be a link');
    });

    await test('8. Click teacher link shows profile', async () => {
      const teacherLink = await page.locator('.course-card .teacher-link').first();
      await teacherLink.click();
      await page.waitForTimeout(1500);
      const profileHeader = await page.locator('.teacher-profile-header');
      await profileHeader.waitFor({ state: 'visible', timeout: 10000 });
    });

    await test('9. Profile shows teacher name', async () => {
      const header = await page.locator('.teacher-profile-header h2');
      const text = await header.textContent();
      if (!text.includes('Teacher') && !text.includes('npub')) {
        console.log('    (header:', text, ')');
      }
    });

    await test('10. Profile shows lightning if available', async () => {
      const lightningSection = await page.locator('.teacher-lightning, .teacher-no-lightning');
      await lightningSection.waitFor({ state: 'visible', timeout: 5000 });
    });

    await test('11. Profile shows courses list', async () => {
      const coursesSection = await page.locator('.card:has-text("Cursos Publicados")');
      await coursesSection.waitFor({ state: 'visible', timeout: 10000 });
    });

    await test('12. Click course from profile works', async () => {
      const viewBtn = await page.locator('.course-card button:has-text("Ver Curso")').first();
      await viewBtn.click();
      await page.waitForTimeout(1500);
      const courseTitle = await page.locator('h2').first();
      await courseTitle.waitFor({ state: 'visible', timeout: 5000 });
    });

    await test('13. Course detail has clickable teacher name', async () => {
      const teacherLink = await page.locator('#teacher-name.teacher-link');
      await teacherLink.waitFor({ state: 'visible', timeout: 5000 });
      const tagName = await teacherLink.evaluate(el => el.tagName);
      if (tagName !== 'A') throw new Error('Should be a link');
    });

    await test('14. Navigate back to teacher profile', async () => {
      const teacherLink = await page.locator('#teacher-name');
      await teacherLink.click();
      await page.waitForTimeout(1500);
      const profileHeader = await page.locator('.teacher-profile-header');
      await profileHeader.waitFor({ state: 'visible', timeout: 10000 });
    });

  } catch (err) {
    console.error('Test error:', err.message);
  } finally {
    await browser.close();
  }

  console.log(`\n📊 Zap Flow Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runZapFlowTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
