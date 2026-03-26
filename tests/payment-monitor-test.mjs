import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5174';

let NSEC_TEST = process.env.TEST_NSEC;
let NWC_URL = process.env.NWC_URL;
let TEST_LUD16 = process.env.TEST_LUD16;
let TEST_PUBKEY = process.env.TEST_PUBKEY;

if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const nsecMatch = secrets.match(/TEST_NSEC=(.+)/);
  if (nsecMatch) NSEC_TEST = nsecMatch[1];
  
  const nwcMatch = secrets.match(/nostr\+walletconnect:\/\/[^\s]+/);
  if (nwcMatch) {
    NWC_URL = nwcMatch[0];
    console.log('   NWC_URL loaded:', NWC_URL.slice(0, 50) + '...');
  }
  
  const lud16Match = secrets.match(/TEST_LUD16=(.+)/);
  if (lud16Match) TEST_LUD16 = lud16Match[1];
  
  const pubkeyMatch = secrets.match(/TEST_PUBKEY=(.+)/);
  if (pubkeyMatch) TEST_PUBKEY = pubkeyMatch[1];
}

if (!TEST_LUD16 || !TEST_PUBKEY) {
  console.error('ERROR: TEST_LUD16 and TEST_PUBKEY must be defined in .secrets');
  process.exit(1);
}

if (!NWC_URL) {
  console.error('ERROR: NWC_URL (nostr+walletconnect://...) must be defined in .secrets');
  process.exit(1);
}

console.log('   NWC_URL:', NWC_URL ? NWC_URL.slice(0, 60) + '...' : 'undefined');

async function payInvoiceWithNWC(invoice) {
  console.log('   Pagando invoice via NWC CLI...');
  console.log('   Invoice:', invoice.slice(0, 40) + '...');
  
  const { execFile } = await import('child_process');
  
  return new Promise((resolve) => {
    const nwcString = NWC_URL || '';
    const env = { ...process.env, NWC_CONNECTION: nwcString };
    
    execFile(
      process.env.HOME + '/.bun/bin/bun',
      ['run', process.env.HOME + '/.nwc-monitor/nwc-cli.mjs', 'pay', invoice],
      { env },
      (error, stdout, stderr) => {
        if (error) {
          console.log('   Error:', error.message);
          resolve(null);
          return;
        }
        console.log('   Result:', stdout.trim());
        resolve({ success: true, output: stdout });
      }
    );
  });
}

async function createAndPayInvoiceLud16() {
  console.log('   Pagando 1 sat a', TEST_LUD16, 'via NWC CLI...');
  
  const { execFile } = await import('child_process');
  
  return new Promise((resolve) => {
    const nwcString = NWC_URL || '';
    const env = { ...process.env, NWC_CONNECTION: nwcString };
    
    execFile(
      process.env.HOME + '/.bun/bin/bun',
      ['run', process.env.HOME + '/.nwc-monitor/nwc-cli.mjs', 'pay-address', '1', TEST_LUD16],
      { env },
      (error, stdout, stderr) => {
        if (error) {
          console.log('   Error:', error.message);
          resolve(null);
          return;
        }
        console.log('   Result:', stdout.trim());
        resolve({ success: true, output: stdout });
      }
    );
  });
}

async function runTest() {
  console.log('\n💸 Test de monitoreo de pagos\n');

  const browser = await chromium.launch({ headless: true });
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
    await page.waitForTimeout(3000);

    console.log('2. Conectando...');
    const connectBtn = await page.locator('#user-menu-connect, #nsec-connect-btn, .btn-connect-header').first();
    await connectBtn.click();
    await page.waitForTimeout(1000);

    const nsecInput = await page.locator('#nsec-input, #nsec-input-header').first();
    await nsecInput.fill(NSEC_TEST);
    const submitBtn = await page.locator('#nsec-connect-btn, #nsec-connect-header-btn').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    console.log('3. Abriendo modal de invoice directamente...');
    
    // Directly create an InvoiceModal
    await page.evaluate(({ lud16, pubkey }) => {
      console.log('[TEST] Creating InvoiceModal with lud16:', lud16);
      try {
        window.invoiceModal = new window.InvoiceModal({
          amount: 1,
          description: 'Test payment 1 sat',
          lud16: lud16,
          recipientPubkey: pubkey,
          onSuccess: (result) => console.log('SUCCESS:', result),
          onError: (err) => console.log('ERROR:', err.message)
        });
        console.log('[TEST] InvoiceModal created, calling show()...');
        window.invoiceModal.show().then(() => {
          console.log('[TEST] show() completed, invoice:', window.invoiceModal?.invoice?.slice(0, 30));
          console.log('[TEST] paymentHash:', window.invoiceModal?.paymentHash);
        }).catch(e => console.log('[TEST] show() error:', e.message));
      } catch (e) {
        console.log('[TEST] Error creating modal:', e.message);
      }
    }, { lud16: TEST_LUD16, pubkey: TEST_PUBKEY });
    
    // Wait for invoice to be generated and tracker to start
    await page.waitForTimeout(5000);
    
    // Now get the invoice and pay it
    const invoiceInfo = await page.evaluate(() => {
      const inv = window.invoiceModal?.invoice;
      const hash = window.invoiceModal?.paymentHash;
      return { invoice: inv, paymentHash: hash };
    });
    
    console.log('   Invoice para pagar:', invoiceInfo.invoice?.slice(0, 40) + '...');
    console.log('   Payment Hash:', invoiceInfo.paymentHash?.slice(0, 20) + '...');

    const modal = await page.locator('#invoice-modal-overlay');
    const modalVisible = await modal.isVisible().catch(() => false);

    if (modalVisible && invoiceInfo.invoice) {
      console.log('   ✓ Modal abierto');

      console.log('4. Pagando el invoice via NWC CLI...');
      const payResult = await payInvoiceWithNWC(invoiceInfo.invoice);
      
      if (payResult && (payResult.payment_hash || payResult.preimage || payResult.ok)) {
        console.log('   ✓ Pago enviado');
      } else if (payResult && payResult.error) {
        console.log('   ✗ Error:', payResult.error);
      }

      console.log('5. Esperando monitoreo (20s)...');
      await page.waitForTimeout(25000);

      console.log('\n📋 Logs de InvoiceTracker:');
      const relevantLogs = logs.filter(l => 
        l.includes('[InvoiceTracker]') || 
        l.includes('Zap receipt') ||
        l.includes('paid') ||
        l.includes('settled') ||
        l.includes('Nostr')
      );
      relevantLogs.forEach(l => console.log(`  - ${l}`));

      // Check final status and UI
      const finalInfo = await page.evaluate(() => {
        const modal = window.invoiceModal;
        const content = document.getElementById('invoice-content')?.innerHTML || '';
        return {
          state: modal?.state || 'no-modal',
          hasSuccess: content.includes('Pago exitoso') || content.includes('paid'),
          content: content.slice(0, 200)
        };
      });
      console.log(`\n   Estado final del modal: ${finalInfo.state}`);
      console.log(`   UI actualizada: ${finalInfo.hasSuccess}`);
      console.log(`   Contenido: ${finalInfo.content}`);

      await page.locator('#invoice-close-btn').click();
      await page.waitForTimeout(500);
    } else {
      console.log('   ✗ Modal no se abrio');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Test completo\n');
}

runTest().catch(console.error);
