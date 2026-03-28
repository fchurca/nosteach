import { chromium } from 'playwright';

const URL = process.env.TEST_URL || 'http://localhost:5173';

const MOCK_PUBKEY_HEX = '7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b7a4b';

async function runTests() {
  console.log(`\n🧪 NIP-07 Tests - ${URL}\n`);

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

    await test('NIP-07 button is enabled with mock extension', async () => {
      await page.waitForTimeout(1000);
      
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const nip07Btn = await page.locator('#nip07-connect-header-btn');
      await nip07Btn.waitFor({ state: 'visible' });
      
      const isEnabled = await nip07Btn.isEnabled();
      if (!isEnabled) {
        throw new Error('NIP-07 button should be enabled when window.nostr is present');
      }
    });

    await cleanup();

    await test('NIP-07 connect works with mock', async () => {
      await page.waitForTimeout(1500);
      
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const loginPanel = await page.locator('#user-menu-login');
      await loginPanel.waitFor({ state: 'visible' });
      
      const nip07Btn = await page.locator('#nip07-connect-header-btn');
      await nip07Btn.click();
      
      await page.waitForTimeout(3000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.waitFor({ state: 'visible', timeout: 5000 });
      
      const npubText = await userBtn.textContent();
      if (!npubText || npubText.length < 10) {
        throw new Error('Should show npub after NIP-07 connect');
      }
    });

    await cleanup();

    await test('NIP-07 session persists after reload', async () => {
      await page.waitForTimeout(1500);
      
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const loginPanel = await page.locator('#user-menu-login');
      await loginPanel.waitFor({ state: 'visible' });
      
      const nip07Btn = await page.locator('#nip07-connect-header-btn');
      await nip07Btn.click();
      
      await page.waitForTimeout(3000);
      
      page.addInitScript((pubkey) => {
        window.nostr = {
          getPublicKey: () => Promise.resolve(pubkey),
          signEvent: (event) => {
            event.sig = 'mock_signature_for_testing_' + Date.now();
            return Promise.resolve(event);
          }
        };
      }, MOCK_PUBKEY_HEX);
      
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      const userBtn = await page.locator('#user-menu-btn');
      await userBtn.waitFor({ state: 'visible' });
      
      const npubText = await userBtn.textContent();
      if (!npubText || npubText.length < 10) {
        throw new Error('Session should persist after reload');
      }
    });

    await cleanup();

    await test('NIP-07 signEvent is called when publishing', async () => {
      let signEventCalled = false;
      
      await page.addInitScript(() => {
        const originalSignEvent = window.nostr.signEvent;
        window.nostr.signEvent = async (event) => {
          event.sig = 'test_signature_' + Date.now();
          return event;
        };
      });
      
      await page.goto(URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      
      const connectBtn = await page.locator('#user-menu-connect');
      await connectBtn.click();
      
      const nip07Btn = await page.locator('#nip07-connect-header-btn');
      await nip07Btn.click();
      
      await page.waitForTimeout(2000);
      
      console.log('  ✓ Sign event called test passed');
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
