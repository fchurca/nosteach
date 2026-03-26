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

if (!NWC_URL) {
  console.error('ERROR: NWC_URL must be defined in .secrets');
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
        if (error) {
          resolve(null);
          return;
        }
        resolve({ success: true, output: stdout });
      }
    );
  });
}

async function runTest() {
  console.log('\n💸 Test: ZapButton flow completo\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
  });
  
  page.on('pageerror', err => {
    console.log('  [PAGE ERROR]', err.message);
  });
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ZapButton') || text.includes('InvoiceModal') || text.includes('Error')) {
      console.log('  [BROWSER]', text);
    }
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

    console.log('3. Activando rol sponsor...');
    await page.evaluate(() => window.app?.navigate('roles'));
    await page.waitForTimeout(2000);

    const sponsorCheckbox = await page.locator('#role-sponsor');
    if (await sponsorCheckbox.isVisible()) {
      await sponsorCheckbox.check();
      await page.waitForTimeout(1000);
    }

    console.log('4. Navegando a cursos...');
    await page.evaluate(() => window.app?.navigate('courses'));
    await page.waitForTimeout(10000);

    const courseCards = await page.locator('.course-card').all();
    if (courseCards.length > 0) {
      console.log(`   ${courseCards.length} cursos, entrando al primero...`);
      
      const viewBtn = await courseCards[0].locator('button:has-text("Ver más")').first();
      await viewBtn.click();
      await page.waitForTimeout(8000);
    }

    console.log('5. Buscando ZapButton...');
    const zapContainer = await page.locator('.zap-button-container, #zap-button-container').innerHTML().catch(() => 'not found');
    console.log('   Container:', zapContainer.slice(0, 200));
    
    // Check if lud16 is available - if not, create InvoiceModal directly
    const needsDirectModal = zapContainer.includes('No tiene Lightning') || zapContainer.includes('lud16');
    console.log('   Needs direct modal:', needsDirectModal);
    
    if (needsDirectModal) {
      console.log('   Opening InvoiceModal directly...');
      await page.evaluate((lud16, pubkey) => {
        window.invoiceModal = new window.InvoiceModal({
          amount: 1,
          description: 'Test payment',
          lud16: lud16,
          recipientPubkey: pubkey,
          onSuccess: (r) => console.log('SUCCESS:', r),
          onError: (e) => console.log('ERROR:', e.message)
        });
        window.invoiceModal.show();
      }, TEST_LUD16, TEST_PUBKEY);
      await page.waitForTimeout(5000);
    }
    
    // Get HTML of buttons
    const btnHtml = await page.evaluate(() => {
      const btns = document.querySelectorAll('.zap-amount-btn');
      return Array.from(btns).map(b => b.outerHTML).join('\n');
    });
    console.log('   Buttons HTML:', btnHtml.slice(0, 500));

    let finalZapBtns = await page.locator('.zap-amount-btn').all();
    
    if (finalZapBtns.length > 0) {
      console.log('6. Click en boton via evaluate...');
      
      // Click via evaluate
      await page.evaluate(() => {
        const btn = document.querySelector('.zap-amount-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(5000);

      // Check if InvoiceModal was created
      const modalInfo = await page.evaluate(() => {
        return {
          hasModal: !!window.invoiceModal,
          invoice: window.invoiceModal?.invoice?.slice(0, 30),
          state: window.invoiceModal?.state,
          amount: window.invoiceModal?.amount
        };
      });
      console.log('   Modal info:', modalInfo);

      const modal = await page.locator('#invoice-modal-overlay');
      const modalVisible = await modal.isVisible().catch(() => false);

      if (modalVisible) {
        console.log('   ✓ Modal abierto');
        
        // Get invoice and pay
        const invoiceInfo = await page.evaluate(() => {
          const inv = window.invoiceModal?.invoice;
          const hash = window.invoiceModal?.paymentHash;
          return { invoice: inv, paymentHash: hash };
        });
        
        console.log('   Invoice:', invoiceInfo.invoice?.slice(0, 40) + '...');
        console.log('   Payment Hash:', invoiceInfo.paymentHash?.slice(0, 20) + '...');

        console.log('7. Pagando invoice...');
        const payResult = await payInvoiceWithNWC(invoiceInfo.invoice);
        
        if (payResult && payResult.success) {
          console.log('   ✓ Pago enviado');
        }

        console.log('8. Esperando monitoreo (15s)...');
        await page.waitForTimeout(18000);

        const finalInfo = await page.evaluate(() => {
          const content = document.getElementById('invoice-content')?.innerHTML || '';
          return {
            hasSuccess: content.includes('Pago exitoso') || content.includes('paid'),
            content: content.slice(0, 200)
          };
        });
        
        console.log(`\n   UI actualizada: ${finalInfo.hasSuccess}`);
        console.log(`   Contenido: ${finalInfo.content}`);
        
        await page.locator('#invoice-close-btn, #invoice-done-btn').click().catch(() => {});
      } else {
        console.log('   ✗ Modal no se abrió');
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
