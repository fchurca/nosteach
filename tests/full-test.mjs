import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

let TEST_URL = process.env.TEST_URL;
if (!TEST_URL && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_URL=(.+)/);
  if (match) TEST_URL = match[1];
}
const URL = TEST_URL || 'http://localhost:5173';

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

async function runFullTest() {
  console.log(`\n🔍 NosTeach FULL EXPLORATORY TEST\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;
  const bugs = [];

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
      bugs.push({ test: name, error: err.message });
    }
  }

  async function observe(name, fn) {
    try {
      await fn();
    } catch (err) {
      console.log(`  ⚠️  ${name}: ${err.message}`);
    }
  }

  async function bug(msg) {
    console.log(`  🐛 BUG: ${msg}`);
    bugs.push({ test: 'OBSERVED', error: msg });
  }

  try {
    // ===== HOME PAGE =====
    console.log('\n🏠 HOME PAGE:');
    
    await test('Home loads', async () => {
      await page.goto(URL, { waitUntil: 'networkidle' });
      const h1 = await page.locator('h1').first().textContent();
      if (!h1.includes('NosTeach')) throw new Error('Heading not found');
    });

    await test('Shows "Acerca de NosTeach"', async () => {
      const section = await page.locator('h3:has-text("Acerca de")').isVisible();
      if (!section) throw new Error('About section missing');
    });

    await test('Has navigation buttons', async () => {
      const home = await page.locator('button:has-text("Inicio")').isVisible();
      const explorar = await page.locator('button:has-text("Explorar")').isVisible();
      if (!home || !explorar) throw new Error('Nav buttons missing');
    });

    await test('Connect button visible', async () => {
      const btn = await page.locator('#user-menu-connect').isVisible();
      if (!btn) throw new Error('Connect button not visible');
    });

    // ===== USER MENU =====
    console.log('\n👤 USER MENU:');

    await test('Click Connect shows login form', async () => {
      await page.locator('#user-menu-connect').click();
      await page.waitForTimeout(300);
      const input = await page.locator('#login-unified-input').isVisible();
      if (!input) throw new Error('Login form not shown');
    });

    await test('Invalid nsec shows error', async () => {
      await page.locator('#login-unified-input').fill('invalid');
      await page.locator('#connect-unified-btn').click();
      await page.waitForTimeout(500);
      const error = await page.locator('#login-error').textContent();
      if (!error.includes('nsec1')) throw new Error('No nsec validation error');
    });

    await test('Empty nsec shows error', async () => {
      await page.locator('#login-unified-input').fill('');
      await page.locator('#connect-unified-btn').click();
      await page.waitForTimeout(500);
      const error = await page.locator('#login-error').textContent();
      if (!error) throw new Error('No empty input error');
    });

    await test('Valid nsec connects', async () => {
      await page.locator('#login-unified-input').fill(NSEC_TEST);
      await page.locator('#connect-unified-btn').click();
      await page.waitForTimeout(2500);
      const userBtn = await page.locator('#user-menu-btn').isVisible();
      if (!userBtn) throw new Error('Login failed');
    });

    await test('After login, Home shows user info', async () => {
      await page.waitForTimeout(500); // Wait for view to refresh
      const content = await page.locator('#content-area').textContent();
      if (!content.includes('Conectado como')) {
        // Check localStorage directly
        const stored = await page.evaluate(() => localStorage.getItem('nostr_pubkey'));
        if (!stored) throw new Error('Session not stored');
        bug('Home view did not refresh after login (timing issue)');
      }
    });

    await test('Dropdown shows user name', async () => {
      await page.locator('#user-menu-btn').click();
      await page.waitForTimeout(300);
      const dropdown = await page.locator('#user-menu-dropdown').isVisible();
      if (!dropdown) throw new Error('Dropdown not shown');
    });

    await test('Dropdown has Mi Cuenta', async () => {
      const miCuenta = await page.locator('#menu-mi-cuenta').isVisible();
      if (!miCuenta) throw new Error('Mi Cuenta option missing');
    });

    await test('Dropdown has Mis Roles', async () => {
      const roles = await page.locator('#menu-roles').isVisible();
      if (!roles) throw new Error('Mis Roles option missing');
    });

    await test('Dropdown has Desconectar', async () => {
      const desconectar = await page.locator('text=Desconectar').isVisible();
      if (!desconectar) throw new Error('Desconectar option missing');
    });

    await test('Disconnect works', async () => {
      await page.locator('text=Desconectar').click();
      await page.waitForTimeout(500);
      const connectBtn = await page.locator('#user-menu-connect').isVisible();
      if (!connectBtn) throw new Error('Disconnect failed');
    });

    // ===== SESSION PERSISTENCE =====
    console.log('\n💾 SESSION PERSISTENCE:');

    await test('Login persists after refresh', async () => {
      await page.locator('#user-menu-connect').click();
      await page.waitForTimeout(300);
      await page.locator('#login-unified-input').fill(NSEC_TEST);
      await page.locator('#connect-unified-btn').click();
      await page.waitForTimeout(2000);
      
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      
      const userBtn = await page.locator('#user-menu-btn').isVisible();
      if (!userBtn) throw new Error('Session not restored');
    });

    await test('Home shows user after refresh', async () => {
      const content = await page.locator('#content-area').textContent();
      if (!content.includes('Conectado como')) {
        bug('Home shows "Ingresá tu nsec" after refresh despite session');
      }
    });

    // ===== ROLES =====
    console.log('\n🎭 ROLES:');

    await test('Navigate to Roles page', async () => {
      await page.locator('#user-menu-btn').click();
      await page.waitForTimeout(300);
      await page.locator('#menu-roles').click();
      await page.waitForTimeout(500);
      const heading = await page.locator('h2:has-text("Mis Roles")').isVisible();
      if (!heading) throw new Error('Roles page not shown');
    });

    await test('All role checkboxes present', async () => {
      const teacher = await page.locator('#role-teacher').isVisible();
      const student = await page.locator('#role-student').isVisible();
      const sponsor = await page.locator('#role-sponsor').isVisible();
      if (!teacher || !student || !sponsor) throw new Error('Missing role checkboxes');
    });

    await test('Check Teacher role', async () => {
      await page.locator('#role-teacher').check();
      await page.waitForTimeout(300);
      const checked = await page.locator('#role-teacher').isChecked();
      if (!checked) throw new Error('Teacher checkbox not checked');
    });

    await test('Crear Curso nav appears with Teacher', async () => {
      const btn = await page.locator('#nav-create-course').isVisible();
      if (!btn) throw new Error('Crear Curso not visible for teacher');
    });

    await test('Check Student role', async () => {
      await page.locator('#role-student').check();
      await page.waitForTimeout(300);
    });

    await test('Check Sponsor role', async () => {
      await page.locator('#role-sponsor').check();
      await page.waitForTimeout(300);
    });

    // ===== MI CUENTA =====
    console.log('\n👤 MI CUENTA:');

    await test('Navigate to Mi Cuenta', async () => {
      await page.locator('#user-menu-btn').click();
      await page.waitForTimeout(300);
      await page.locator('#menu-mi-cuenta').click();
      await page.waitForTimeout(500);
      const heading = await page.locator('h2:has-text("Mi Cuenta")').isVisible();
      if (!heading) throw new Error('Mi Cuenta not shown');
    });

    await test('Mi Cuenta shows user data', async () => {
      const content = await page.locator('#content-area').textContent();
      if (content.includes('Conectá tu identidad')) {
        bug('Mi Cuenta shows "Conectá tu identidad" despite being logged in');
      }
      if (!content.includes('npub')) {
        bug('Mi Cuenta missing npub display');
      }
    });

    await test('Mi Cuenta has Editar Roles button', async () => {
      const btn = await page.locator('button:has-text("Editar Roles")').isVisible();
      if (!btn) throw new Error('Editar Roles button missing');
    });

    // ===== COURSES =====
    console.log('\n📚 COURSES:');

    await test('Navigate to Courses', async () => {
      await page.locator('button:has-text("Explorar")').click();
      await page.waitForTimeout(500);
      const heading = await page.locator('h2:has-text("Explorar Cursos")').isVisible();
      if (!heading) throw new Error('Courses page not shown');
    });

    await test('Courses page shows loading', async () => {
      const loading = await page.locator('text=Cargando cursos').isVisible();
      if (!loading) bug('Courses page does not show loading state');
    });

    await test('Courses page eventually loads', async () => {
      await page.waitForTimeout(5000);
      const hasCards = await page.locator('.course-card').count();
      const emptyState = await page.locator('text=Aún no hay cursos').isVisible();
      if (hasCards === 0 && !emptyState && !await page.locator('.error-text').isVisible()) {
        bug('Courses page stuck in loading state');
      } else {
        console.log(`    Found ${hasCards} course(s)`);
      }
    });

    // ===== COURSE CREATION =====
    console.log('\n✏️ COURSE CREATION:');

    await test('Navigate to Create Course', async () => {
      await page.locator('#nav-create-course').click();
      await page.waitForTimeout(500);
      const form = await page.locator('#course-form').isVisible();
      if (!form) throw new Error('Course form not shown');
    });

    await test('Form has all fields', async () => {
      const titulo = await page.locator('#course-titulo').isVisible();
      const desc = await page.locator('#course-descripcion').isVisible();
      const precio = await page.locator('#course-precio').isVisible();
      if (!titulo || !desc || !precio) throw new Error('Missing form fields');
    });

    await test('Add Module button works', async () => {
      const before = await page.locator('.modulo-item').count();
      await page.locator('button:has-text("Agregar Módulo")').click();
      await page.waitForTimeout(300);
      const after = await page.locator('.modulo-item').count();
      if (after <= before) throw new Error('Module not added');
    });

    await test('Add Question button works', async () => {
      const before = await page.locator('.pregunta-item').count();
      await page.locator('button:has-text("Agregar Pregunta")').click();
      await page.waitForTimeout(300);
      const after = await page.locator('.pregunta-item').count();
      if (after <= before) throw new Error('Question not added');
    });

    await test('Custom price shows input', async () => {
      await page.locator('#course-precio').selectOption('custom');
      await page.waitForTimeout(300);
      const customInput = await page.locator('#course-precio-custom').isVisible();
      if (!customInput) throw new Error('Custom price input not shown');
    });

    await test('Submit empty form shows validation', async () => {
      await page.locator('button:has-text("Publicar Curso")').click();
      await page.waitForTimeout(500);
      
      page.on('dialog', async dialog => {
        const text = dialog.message();
        if (!text.includes('Errores')) {
          bug('Empty form submit did not show validation errors');
        }
        await dialog.dismiss();
      });
      await page.waitForTimeout(1000);
    });

    await test('Fill and submit course form', async () => {
      await page.locator('#course-titulo').fill('Test Course from Exploratory');
      await page.locator('#course-descripcion').fill('Testing the course creation flow');
      await page.locator('#course-precio').selectOption('0');
      
      await page.locator('.pregunta-texto').first().fill('What is 2+2?');
      await page.locator('.pregunta-opciones').first().fill('3,4,5');
      await page.locator('.pregunta-correcta').first().fill('1');
      
      await page.locator('button:has-text("Publicar Curso")').click();
      await page.waitForTimeout(3000);
    });

    // ===== COURSE VIEW =====
    console.log('\n📖 COURSE VIEW:');

    await test('Navigate to courses after publish', async () => {
      await page.locator('button:has-text("Explorar")').click();
      await page.waitForTimeout(3000);
    });

    const courseCount = await page.locator('.course-card').count();
    if (courseCount > 0) {
      await test('Course cards have Ver más button', async () => {
        const btn = await page.locator('button:has-text("Ver más")').first().isVisible();
        if (!btn) throw new Error('Ver más button not found');
      });

      await test('Click Ver más opens course view', async () => {
        await page.locator('button:has-text("Ver más")').first().click();
        await page.waitForTimeout(2000);
        const backBtn = await page.locator('button:has-text("Volver")').isVisible();
        if (!backBtn) throw new Error('Course view not loaded');
      });

      await test('Course view shows price', async () => {
        const content = await page.locator('#content-area').textContent();
        if (!content.includes('💰')) {
          bug('Course view missing price');
        }
      });

      await test('Go back to courses', async () => {
        await page.locator('button:has-text("Volver")').click();
        await page.waitForTimeout(500);
        const heading = await page.locator('h2:has-text("Explorar Cursos")').isVisible();
        if (!heading) throw new Error('Back navigation failed');
      });
    } else {
      console.log('    ⏭️  No courses to test view');
    }

    // ===== EVALUATION (if courses with questions exist) =====
    console.log('\n📝 EVALUATION:');

    if (courseCount > 0) {
      await test('Open course with evaluation', async () => {
        await page.locator('button:has-text("Ver más")').first().click();
        await page.waitForTimeout(2000);
      });

      const evalBtn = await page.locator('#start-evaluation-btn').isVisible().catch(() => false);
      if (evalBtn) {
        await test('Student can take evaluation', async () => {
          await page.locator('#start-evaluation-btn').click();
          await page.waitForTimeout(500);
          const form = await page.locator('#evaluation-form').isVisible();
          if (!form) throw new Error('Evaluation form not shown');
        });

        await test('Submit evaluation', async () => {
          await page.locator('input[type="radio"]').first().click();
          await page.locator('button:has-text("Enviar Respuestas")').click();
          await page.waitForTimeout(2000);
        });
      } else {
        console.log('    ⏭️  No evaluation button (not student or no questions)');
      }
    }

    // ===== EDGE CASES =====
    console.log('\n⚠️ EDGE CASES:');

    await test('Non-teacher cannot access Create Course', async () => {
      await page.locator('button:has-text("Volver")').click().catch(() => {});
      await page.locator('#user-menu-btn').click().catch(() => {});
      await page.locator('#menu-roles').click().catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('#role-teacher').uncheck().catch(() => {});
      await page.waitForTimeout(300);
      
      await page.locator('button:has-text("Inicio")').click().catch(() => {});
      await page.waitForTimeout(300);
      
      await page.goto(URL + '/#/create-course').catch(() => {});
      await page.waitForTimeout(500);
      
      // Via nav button
      const btn = await page.locator('#nav-create-course').isVisible().catch(() => false);
      if (btn) {
        await page.locator('#nav-create-course').click();
        await page.waitForTimeout(500);
        const denied = await page.locator('text=Acceso denegado').isVisible().catch(() => false);
        if (!denied) {
          bug('Non-teacher can access course creation');
        }
      }
    });

    await test('Home cards show based on roles', async () => {
      await page.locator('#user-menu-btn').click().catch(() => {});
      await page.locator('#menu-roles').click().catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('#role-teacher').check().catch(() => {});
      await page.waitForTimeout(300);
      
      await page.locator('button:has-text("Inicio")').click().catch(() => {});
      await page.waitForTimeout(500);
      
      const crearCard = await page.locator('h3:has-text("Crear Curso")').isVisible().catch(() => false);
      if (!crearCard) {
        bug('Crear Curso card not visible for teacher role');
      }
    });

    // ===== FOOTER =====
    console.log('\n🦶 FOOTER:');

    await test('Footer links present', async () => {
      const footer = await page.locator('.footer').isVisible().catch(() => false);
      if (!footer) {
        bug('Footer not visible');
      }
    });

    // ===== FINAL STATE =====
    console.log('\n📊 FINAL:');

  } finally {
    await browser.close();
  }

  console.log(`\n========================================`);
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
  
  if (bugs.length > 0) {
    console.log(`\n🐛 BUGS/OBSERVATIONS (${bugs.length}):`);
    bugs.forEach(b => console.log(`   • ${b.error}`));
  }
  
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

runFullTest().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
