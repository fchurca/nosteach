import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

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

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';

async function run() {
  console.log('🔍 Buscando perfil de debbie...\n');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('  ', msg.text().substring(0, 100));
  });
  
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Login
  console.log('1. Login con debbie...');
  await page.locator('#user-menu-connect').click();
  await page.waitForTimeout(500);
  await page.locator('#login-unified-input').fill(NSEC_TEST);
  await page.locator('#connect-unified-btn').click();
  await page.waitForTimeout(3000);
  
  // Ver Mi Cuenta para ver lud16
  console.log('\n2. Verificando Mi Cuenta...');
  await page.locator('#user-menu-btn').click();
  await page.waitForTimeout(300);
  await page.locator('#menu-mi-cuenta').click();
  await page.waitForTimeout(500);
  
  const content = await page.content();
  
  // Buscar lud16
  const lud16Match = content.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]+)/);
  if (lud16Match) {
    console.log(`   ✅ Lightning Address: ${lud16Match[1]}`);
  } else {
    console.log('   ⚠️ No se encontró Lightning Address');
  }
  
  // También buscar en los logs del NostrConnect
  console.log('\n3. Datos del perfil:');
  await page.evaluate(() => {
    const profile = window.localStorage.getItem('nostr_profile');
    if (profile) {
      console.log('   Profile:', JSON.parse(profile));
    }
  });
  
  await browser.close();
  console.log('\n✅ Listo');
}

run().catch(console.error);
