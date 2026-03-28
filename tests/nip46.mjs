import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5173';

const MOCK_PUBKEY_HEX = '7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b';

let NSEC_TEST = process.env.TEST_NSEC;
if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC=(.+)/);
  if (match) NSEC_TEST = match[1];
}

async function runTests() {
  console.log(`\n🧪 NIP-46 Tests - ${URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.addInitScript((pubkey) => {
    window.nostr = {
      getPublicKey: () => Promise.resolve(pubkey),
      signEvent: (event) => {
        event.sig = 'mock_signature_for_testing_' + Date.now();
        return Promise.resolve(event);
      }
    };
  }, MOCK_PUBKEY_HEX);

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

  async function cleanup() {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  }

  try {
    await cleanup();

    await test('NIP-46 UI elements exist in login form', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const loginPanel = await page.locator('#user-menu-login');
      await loginPanel.waitFor({ state: 'visible' });
      
      const nsecInput = await page.locator('#nsec-input-header');
      const nsecBtn = await page.locator('#nsec-connect-header-btn');
      const nip07Btn = await page.locator('#nip07-connect-header-btn');
      
      const nsecExists = await nsecInput.count() > 0;
      const btnExists = await nsecBtn.count() > 0;
      const nip07Exists = await nip07Btn.count() > 0;
      
      if (!nsecExists || !btnExists || !nip07Exists) {
        throw new Error('NIP-46 UI elements missing');
      }
    });

    await cleanup();

    await test('NIP-46 bunker UI elements exist', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const loginPanel = await page.locator('#user-menu-login');
      await loginPanel.waitFor({ state: 'visible' });
      
      const bunkerInput = await page.locator('#bunker-url-input');
      const bunkerBtn = await page.locator('#bunker-connect-btn');
      const nostrConnectBtn = await page.locator('#nostrconnect-btn');
      
      const bunkerInputExists = await bunkerInput.count() > 0;
      const bunkerBtnExists = await bunkerBtn.count() > 0;
      const ncBtnExists = await nostrConnectBtn.count() > 0;
      
      if (!bunkerInputExists || !bunkerBtnExists || !ncBtnExists) {
        throw new Error('Bunker UI elements missing');
      }
    });

    await cleanup();

    await test('Can login with nsec after NIP-46 UI shown', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const loginPanel = await page.locator('#user-menu-login');
      await loginPanel.waitFor({ state: 'visible' });
      
      const nsecInput = await page.locator('#nsec-input-header');
      await nsecInput.fill(NSEC_TEST);
      
      const nsecBtn = await page.locator('#nsec-connect-header-btn');
      await nsecBtn.click();
      
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.waitFor({ state: 'visible', timeout: 5000 });
    });

    await cleanup();

    await test('Session persists after reload with nsec', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const loginPanel = await page.locator('#user-menu-login');
      await loginPanel.waitFor({ state: 'visible' });
      
      const nsecInput = await page.locator('#nsec-input-header');
      await nsecInput.fill(NSEC_TEST);
      
      const nsecBtn = await page.locator('#nsec-connect-header-btn');
      await nsecBtn.click();
      
      await page.waitForTimeout(2000);
      
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      const isVisible = await userBtn.isVisible();
      
      if (!isVisible) {
        throw new Error('Session should persist after reload');
      }
    });

    await cleanup();

    await test('Disconnect works correctly', async () => {
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const loginPanel = await page.locator('#user-menu-login');
      await loginPanel.waitFor({ state: 'visible' });
      
      const nsecInput = await page.locator('#nsec-input-header');
      await nsecInput.fill(NSEC_TEST);
      
      const nsecBtn = await page.locator('#nsec-connect-header-btn');
      await nsecBtn.click();
      
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.waitFor({ state: 'visible' });
      await userBtn.click();
      
      const dropdown = await page.locator('#user-menu-dropdown');
      await dropdown.waitFor({ state: 'visible' });
      
      const disconnectLink = await page.locator('a:has-text("Desconectar")');
      await disconnectLink.click();
      
      await page.waitForTimeout(1000);
      
      const connectBtnAfter = await page.locator('#user-menu-connect');
      const isVisible = await connectBtnAfter.isVisible();
      
      if (!isVisible) {
        throw new Error('Disconnect should show connect button');
      }
    });

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
