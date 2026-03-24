import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5176';

let NSEC_TEST = process.env.TEST_NSEC;
if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC=(.+)/);
  if (match) NSEC_TEST = match[1];
}
if (!NSEC_TEST) {
  console.error('ERROR: TEST_NSEC no encontrado');
  process.exit(1);
}

async function runPaymentTest() {
  console.log(`\n💸 Payment Test - ${URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    logs.push(msg.text());
  });

  try {
    console.log('1. Loading page...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('2. Connecting with nsec...');
    const connectBtn = await page.locator('#user-menu-connect, #nsec-connect-btn, .btn-connect-header').first();
    await connectBtn.click();
    await page.waitForTimeout(1000);
    
    const nsecInput = await page.locator('#nsec-input, #nsec-input-header').first();
    await nsecInput.fill(NSEC_TEST);
    const submitBtn = await page.locator('#nsec-connect-btn, #nsec-connect-header-btn').first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    console.log('3. Navigating to courses...');
    await page.evaluate(() => window.app?.navigate('courses'));
    await page.waitForTimeout(5000);

    console.log('4. Looking for a course with ZapButton...');
    const zapButtons = await page.locator('.zap-amount-btn').all();
    console.log(`   Found ${zapButtons.length} zap buttons`);

    if (zapButtons.length === 0) {
      console.log('   No courses with zap buttons, checking course list...');
      const courseCards = await page.locator('.course-card').all();
      console.log(`   Found ${courseCards.length} course cards`);
      
      if (courseCards.length > 0) {
        console.log('5. Clicking on first course...');
        await courseCards[0].click();
        await page.waitForTimeout(3000);
      }
    }

    const visibleZapBtns = await page.locator('.zap-amount-btn').all();
    if (visibleZapBtns.length > 0) {
      console.log('6. Clicking first zap button...');
      await visibleZapBtns[0].click();
      await page.waitForTimeout(2000);

      const modal = await page.locator('#invoice-modal-overlay');
      const modalVisible = await modal.isVisible().catch(() => false);
      
      if (modalVisible) {
        console.log('   ✓ Invoice modal opened');
        
        const invoice = await page.locator('#invoice-string').inputValue();
        console.log(`   Invoice: ${invoice.substring(0, 40)}...`);
        
        console.log('7. Waiting for Nostr subscription logs...');
        await page.waitForTimeout(5000);
        
        const nostrLogs = logs.filter(l => 
          l.includes('[InvoiceTracker]') || 
          l.includes('Zap receipt') ||
          l.includes('Nostr')
        );
        
        console.log(`   Found ${nostrLogs.length} relevant logs:`);
        nostrLogs.forEach(l => console.log(`   - ${l}`));
        
        console.log('\n   Closing modal...');
        await page.locator('#invoice-close-btn').click();
        await page.waitForTimeout(500);
      } else {
        console.log('   ⚠️ Modal did not open');
      }
    } else {
      console.log('   ⚠️ No zap buttons visible');
    }

    console.log('\n📊 Payment test complete\n');
    
  } catch (err) {
    console.error('Test error:', err.message);
  } finally {
    await browser.close();
  }
}

runPaymentTest().catch(console.error);
