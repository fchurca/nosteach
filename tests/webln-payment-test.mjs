import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5175';

let NSEC_TEST = process.env.TEST_NSEC;

if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const nsecMatch = secrets.match(/TEST_NSEC=(.+)/);
  if (nsecMatch) NSEC_TEST = nsecMatch[1];
}

async function runTest() {
  console.log('\n💸 Test de monitoreo de pagos via WebLN\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log('  [BROWSER]', text);
    logs.push(text);
  });

  page.on('pageerror', err => {
    console.log('  [PAGE ERROR]', err.message);
  });

  try {
    console.log('1. Cargando pagina...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('2. Conectando con nsec...');
    const connectBtn = await page.locator('#user-menu-connect, #nsec-connect-btn, .btn-connect-header').first();
    await connectBtn.click();
    await page.waitForTimeout(1000);

    const nsecInput = await page.locator('#nsec-input, #nsec-input-header').first();
    await nsecInput.fill(NSEC_TEST);
    const submitBtn = await page.locator('#nsec-connect-btn, #nsec-connect-header-btn').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    console.log('3. Abriendo InvoiceModal para 1 sat...');
    
    await page.evaluate(() => {
      window.invoiceModal = new window.InvoiceModal({
        amount: 1,
        description: 'Test payment 1 sat via WebLN',
        lud16: 'justdingo6@primal.net',
        recipientPubkey: 'f81611363554b64306467234d7396ec88455707633f54738f6c4683535098cd3',
        onSuccess: (result) => console.log('SUCCESS:', result),
        onError: (err) => console.log('ERROR:', err.message)
      });
      window.invoiceModal.show();
    });
    
    await page.waitForTimeout(3000);
    
    const invoiceInfo = await page.evaluate(() => ({
      invoice: window.invoiceModal?.invoice,
      paymentHash: window.invoiceModal?.paymentHash,
      verifyUrl: window.invoiceModal?.verifyUrl
    }));
    
    console.log('   Invoice:', invoiceInfo.invoice?.slice(0, 40) + '...');
    console.log('   Hash:', invoiceInfo.paymentHash?.slice(0, 20) + '...');
    console.log('   VerifyURL:', invoiceInfo.verifyUrl);

    console.log('\n   💡 El invoice está listo. Ahora pagalo desde tu Alby wallet en el browser.');
    console.log('   El InvoiceTracker detectará el pago via Nostr subscription (kind 9735)');
    console.log('   Esperando 60 segundos...\n');
    
    await page.waitForTimeout(60000);

    console.log('\n📋 Verificando logs...');
    const hasPaymentDetected = logs.some(l => 
      l.includes('paid') || l.includes('settled') || l.includes('Zap receipt') || l.includes('Pago exitoso')
    );
    
    console.log('   Payment detected:', hasPaymentDetected ? '✓ SI' : '✗ NO');
    
    const finalInfo = await page.evaluate(() => {
      const content = document.getElementById('invoice-content')?.innerHTML || '';
      return {
        hasSuccess: content.includes('Pago exitoso') || content.includes('paid'),
        content: content.slice(0, 200)
      };
    });
    console.log('   UI Success:', finalInfo.hasSuccess);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Test completo\n');
}

runTest().catch(console.error);