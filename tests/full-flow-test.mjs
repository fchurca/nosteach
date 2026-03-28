import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5173';

let NSEC_TEST = process.env.TEST_NSEC;
let NWC_URL = process.env.NWC_URL;
let TEST_LUD16 = process.env.TEST_LUD16;
let TEST_PUBKEY = process.env.TEST_PUBKEY;

if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const nsecMatch = secrets.match(/TEST_NSEC=(.+)/);
  if (nsecMatch) NSEC_TEST = nsecMatch[1];
  const nwcMatch = secrets.match(/nostr\+walletconnect:\/\/[^\s]+/);
  if (nwcMatch) NWC_URL = nwcMatch[0];
  const lud16Match = secrets.match(/TEST_LUD16=(.+)/);
  if (lud16Match) TEST_LUD16 = lud16Match[1];
  const pubkeyMatch = secrets.match(/TEST_PUBKEY=(.+)/);
  if (pubkeyMatch) TEST_PUBKEY = pubkeyMatch[1];
}

if (!TEST_LUD16 || !TEST_PUBKEY) {
  console.error('ERROR: TEST_LUD16 and TEST_PUBKEY must be defined in .secrets');
  process.exit(1);
}

async function payInvoiceWithNWC(invoice) {
  const { execFile } = await import('child_process');
  return new Promise((resolve) => {
    const nwcString = NWC_URL || '';
    const env = { ...process.env, NWC_CONNECTION: nwcString };
    execFile(
      process.env.HOME + '/.bun/bin/bun',
      ['run', process.env.HOME + '/.nwc-monitor/nwc-cli.mjs', 'pay', invoice],
      { env },
      (error, stdout, stderr) => {
        if (error) { resolve(null); return; }
        resolve({ success: true, output: stdout });
      }
    );
  });
}

async function runTest() {
  console.log('\n💸 Test: Flow completo ZapButton -> InvoiceModal -> Polling\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    console.log('  [CONSOLE]', text);
  });

  page.on('pageerror', err => {
    console.log('  [ERROR]', err.message);
  });

  try {
    console.log('1. Cargar pagina...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('2. Login...');
    await page.locator('#user-menu-connect, #nsec-connect-btn, .btn-connect-header').first().click();
    await page.waitForTimeout(1000);
    await page.locator('#nsec-input, #login-unified-input').first().fill(NSEC_TEST);
    await page.locator('#nsec-connect-btn, #connect-unified-btn').first().click();
    await page.waitForTimeout(5000);

    console.log('3. Activar rol sponsor...');
    await page.evaluate(() => window.app?.navigate('roles'));
    await page.waitForTimeout(2000);
    const sponsorCheckbox = await page.locator('#role-sponsor');
    if (await sponsorCheckbox.isVisible()) {
      await sponsorCheckbox.check();
      await page.waitForTimeout(1000);
    }

    console.log('4. Ir a cursos...');
    await page.evaluate(() => window.app?.navigate('courses'));
    await page.waitForTimeout(10000);

    console.log('5. Entrar al primer curso...');
    const courseCards = await page.locator('.course-card').all();
    if (courseCards.length > 0) {
      await courseCards[0].locator('button:has-text("Ver más")').first().click();
      await page.waitForTimeout(8000);
    }

    console.log('6. Buscar boton Custom...');
    const customBtn = await page.locator('.zap-custom-btn').first();
    const isVisible = await customBtn.isVisible().catch(() => false);
    console.log('   Custom button visible:', isVisible);

    if (isVisible) {
      console.log('7. Click en Custom...');
      await customBtn.click();
      await page.waitForTimeout(2000);

      console.log('8. Ingresar monto 1...');
      const input = await page.locator('#zap-custom-amount');
      await input.fill('1');
      
      const confirmBtn = await page.locator('#zap-custom-confirm');
      await confirmBtn.click();
      await page.waitForTimeout(5000);

      console.log('9. Esperar modal...');
      const modal = await page.locator('#invoice-modal-overlay');
      const modalVisible = await modal.isVisible().catch(() => false);
      console.log('   Modal visible:', modalVisible);

      if (modalVisible) {
        console.log('10. Invoice generada! Esperando polling (10s)...');
        await page.waitForTimeout(10000);

        const content = await page.locator('#invoice-content').innerHTML();
        console.log('    Contenido del modal:', content.slice(0, 200));
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
  console.log('\n✅ Test completo\n');
}

runTest().catch(console.error);
