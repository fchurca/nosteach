import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = 'http://localhost:5174';

let NSEC_TEST = process.env.TEST_NSEC;
let NWC_SECRET = process.env.NWC_SECRET;
let TEST_LUD16 = process.env.TEST_LUD16;
let TEST_PUBKEY = process.env.TEST_PUBKEY;

if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const nsecMatch = secrets.match(/TEST_NSEC=(.+)/);
  if (nsecMatch) NSEC_TEST = nsecMatch[1];
  
  const nwcMatch = secrets.match(/secret=([^&]+)/);
  if (nwcMatch) NWC_SECRET = nwcMatch[1];
  
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
  console.log('   Pagando invoice via NWC...');
  console.log('   NWC_SECRET:', NWC_SECRET ? NWC_SECRET.slice(0, 20) + '...' : 'undefined');
  
  if (!NWC_SECRET) {
    console.log('   Sin NWC_SECRET, usando metodo alternativo...');
    return null;
  }
  
  // Try different Alby endpoints
  const endpoints = [
    'https://api.getalby.com/invoices/pay',
    'https://api.getalby.com/payments',
    'https://api.getalby.com/pay/invoice'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   Probando endpoint: ${endpoint}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `NWC ${NWC_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invoice })
      });
      
      console.log('   Response status:', response.status);
      
      if (response.status === 200 || response.status === 201) {
        const text = await response.text();
        console.log('   Response:', text.slice(0, 200));
        return JSON.parse(text);
      }
    } catch (err) {
      console.log('   Error:', err.message);
    }
  }
  
  return null;
}

async function createAndPayInvoiceLud16() {
  console.log('   Creando invoice via LNURLp y pagando...');
  
  // First, get the LNURL for the lud16
  const lud16 = TEST_LUD16;
  const [username, domain] = lud16.split('@');
  
  try {
    // Get LNURLp info
    const lnurlResponse = await fetch(`https://${domain}/.well-known/lnurlp/${username}`);
    const lnurlData = await lnurlResponse.json();
    console.log('   LNURLp data:', JSON.stringify(lnurlData).slice(0, 100));
    
    if (!lnurlData.callback) {
      console.log('   No callback found');
      return null;
    }
    
    // Create invoice for 21 sats (21000 millisats)
    const callbackUrl = new globalThis.URL(lnurlData.callback);
    callbackUrl.searchParams.set('amount', '21000'); // 21 sats in millisats
    
    const invoiceResponse = await fetch(callbackUrl.toString());
    const invoiceData = await invoiceResponse.json();
    console.log('   Invoice created:', invoiceData.pr?.slice(0, 50) + '...');
    
    if (invoiceData.pr) {
      // Now pay with NWC
      return await payInvoiceWithNWC(invoiceData.pr);
    }
  } catch (err) {
    console.log('   Error:', err.message);
  }
  
  return null;
}

async function runTest() {
  console.log('\n💸 Test de monitoreo de pagos\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
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
      window.invoiceModal = new window.InvoiceModal({
        amount: 1,
        description: 'Test payment 1 sat',
        lud16: lud16,
        recipientPubkey: pubkey,
        onSuccess: (result) => console.log('SUCCESS:', result),
        onError: (err) => console.log('ERROR:', err.message)
      });
      window.invoiceModal.show();
    }, { lud16: TEST_LUD16, pubkey: TEST_PUBKEY });
    
    await page.waitForTimeout(8000);

    const modal = await page.locator('#invoice-modal-overlay');
    const modalVisible = await modal.isVisible().catch(() => false);

    if (modalVisible) {
      console.log('   ✓ Modal abierto');
      
      // Check what's in the modal
      const modalContent = await page.locator('#invoice-content').innerHTML();
      console.log('   Contenido:', modalContent.slice(0, 300));
      
      const invoice = await page.locator('#invoice-string').inputValue().catch(() => '');
      console.log(`   Invoice: ${invoice.substring(0, 60)}...`);
      
      // Get the payment hash from the modal
      const paymentHash = await page.evaluate(() => {
        return window.invoiceModal?.paymentHash || null;
      });
      console.log(`   Payment Hash: ${paymentHash || 'extrayendo...'}`);

      console.log('4. Pagando invoice via LNURLp + NWC...');
      const payResult = await createAndPayInvoiceLud16();
      
      if (payResult && (payResult.payment_hash || payResult.preimage || payResult.ok)) {
        console.log('   ✓ Pago enviado');
      } else if (payResult && payResult.error) {
        console.log('   ✗ Error:', payResult.error);
      }

      console.log('5. Esperando monitoreo (20s)...');
      await page.waitForTimeout(20000);

      console.log('\n📋 Logs de InvoiceTracker:');
      const relevantLogs = logs.filter(l => 
        l.includes('[InvoiceTracker]') || 
        l.includes('Zap receipt') ||
        l.includes('paid') ||
        l.includes('settled') ||
        l.includes('Nostr')
      );
      relevantLogs.forEach(l => console.log(`  - ${l}`));

      // Check final status
      const finalStatus = await page.evaluate(() => {
        return window.invoiceModal?.state || 'unknown';
      });
      console.log(`\n   Estado final del modal: ${finalStatus}`);

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
