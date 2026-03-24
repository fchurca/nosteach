import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5174';

let NSEC_TEST = process.env.TEST_NSEC;
if (!NSEC_TEST && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC=(.+)/);
  if (match) NSEC_TEST = match[1];
}

const RELAYS = [
  'wss://nos.lol',
  'wss://purplepag.es', 
  'wss://relay.snort.social',
  'wss://inbox.nostr.wine'
];

async function relayQuery(relay, filters) {
  return new Promise((resolve) => {
    const ws = new WebSocket(relay);
    const results = [];
    const subscriptionId = Math.random().toString(36).substring(2, 10);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data[0] === 'EVENT' && data[1] === subscriptionId) {
          results.push(data[2]);
        } else if (data[0] === 'EOSE') {
          ws.send(JSON.stringify(['CLOSE', subscriptionId]));
          ws.close();
          resolve(results);
        }
      } catch (e) {}
    };

    ws.onopen = () => {
      ws.send(JSON.stringify(['REQ', subscriptionId, filters]));
    };

    ws.onerror = () => resolve(results);
    ws.onclose = () => resolve(results);

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['CLOSE', subscriptionId]));
        ws.close();
      }
      resolve(results);
    }, 8000);
  });
}

async function runTest() {
  console.log('\n🔍 Buscando cursos en relays...\n');

  for (const relay of RELAYS) {
    try {
      console.log(`Consultando ${relay}...`);
      const events = await relayQuery(relay, { kinds: [30078], '#t': ['nosteach'], limit: 10 });
      console.log(`  → ${events.length} cursos encontrados`);
      
      if (events.length > 0) {
        console.log('\nCursos encontrados:');
        events.forEach((e, i) => {
          try {
            const c = typeof e.content === 'string' ? JSON.parse(e.content) : e.content;
            console.log(`  ${i+1}. "${c.titulo}" por ${e.pubkey.slice(0, 16)}...`);
          } catch {}
        });
        break;
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log('\n🌐 Iniciando navegador para probar pago...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('[InvoiceTracker]') || text.includes('Nostr') || text.includes('zap')) {
      console.log('  📝', text);
    }
  });

  try {
    console.log('1. Cargando página...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('2. Conectando con nsec...');
    const connectBtn = await page.locator('#user-menu-connect, #nsec-connect-btn, .btn-connect-header').first();
    await connectBtn.click();
    await page.waitForTimeout(1000);

    const nsecInput = await page.locator('#nsec-input, #nsec-input-header').first();
    await nsecInput.fill(NSEC_TEST);
    const submitBtn = await page.locator('#nsec-connect-btn, #nsec-connect-header-btn').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);

    console.log('3. Activando roles (profesor y sponsor)...');
    await page.evaluate(() => window.app?.navigate('roles'));
    await page.waitForTimeout(2000);

    const teacherCheckbox = await page.locator('#role-teacher');
    if (await teacherCheckbox.isVisible()) {
      await teacherCheckbox.check();
      await page.waitForTimeout(500);
    }

    const sponsorCheckbox = await page.locator('#role-sponsor');
    if (await sponsorCheckbox.isVisible()) {
      await sponsorCheckbox.check();
      await page.waitForTimeout(500);
    }

    console.log('4. Navegando a cursos...');
    await page.evaluate(() => window.app?.navigate('courses'));
    await page.waitForTimeout(15000);

    const coursesHtml = await page.content();
    if (coursesHtml.includes('course-card')) {
      console.log('   ✓ Hay elementos course-card en el HTML');
    } else if (coursesHtml.includes('No hay cursos') || coursesHtml.includes('empty')) {
      console.log('   ⚠️ Mensaje de sin cursos');
    } else {
      console.log('   ⚠️ Estado del container:');
      const contentArea = await page.locator('#courses-container').innerHTML();
      console.log('   ', contentArea.slice(0, 500));
    }

    console.log('5. Buscando cursos con zap...');
    let courseCards = await page.locator('.course-card').all();
    
    if (courseCards.length > 0) {
      console.log(`   ${courseCards.length} cursos encontrados`);
      console.log('   Click en boton "Ver más" del primer curso...');
      const viewBtn = await courseCards[0].locator('button:has-text("Ver más")').first();
      await viewBtn.click();
      await page.waitForTimeout(5000);
    } else {
      console.log('   No hay cursos');
    }
    
    if (courseCards.length === 0) {
      console.log('   No hay cursos, creando uno...');
      
      await page.evaluate(() => window.app?.navigate('create-course'));
      await page.waitForTimeout(3000);

      // Try different selectors for the form
      const titleInput = await page.locator('input[name="titulo"], #curso-titulo, input#titulo, input[type="text"]').first();
      const descInput = await page.locator('textarea[name="descripcion"], #curso-descripcion, textarea#descripcion, textarea').first();

      if (await titleInput.isVisible()) {
        console.log('   Llenando formulario...');
        await titleInput.fill('Curso de Prueba Lightning');
        await descInput.fill('Este curso es para probar el sistema de pagos');
        
        const submitBtn2 = await page.locator('button[type="submit"]').first();
        if (await submitBtn2.isVisible()) {
          console.log('   Enviando formulario...');
          await submitBtn2.click();
          await page.waitForTimeout(10000);
          console.log('   Formulario enviado');
        }
      } else {
        console.log('   Formulario no visible, buscando otras opciones...');
        // Maybe there's a simpler way - let's refresh and try to find courses again
        await page.reload();
        await page.waitForTimeout(3000);
        
        await page.evaluate(() => window.app?.navigate('courses'));
        await page.waitForTimeout(10000);
      }
    }

    console.log('6. Buscando ZapButton...');
    const zapContainer = await page.locator('#zap-button-container').innerHTML().catch(() => 'not found');
    console.log('   Container HTML:', zapContainer.slice(0, 300));
    
    const zapBtns = await page.locator('.zap-amount-btn').all();
    console.log(`   Encontrados ${zapBtns.length} botones de zap`);
    
    // Check all buttons on page
    const allBtns = await page.locator('button').count();
    console.log(`   Total botones en pagina: ${allBtns}`);

    if (zapBtns.length > 0) {
      console.log('7. Los botones están deshabilitados (sin WebLN)');
      console.log('   Probando monitoreo de Nostr directamente...');
      
      // Test the InvoiceTracker subscription directly via JS
      await page.evaluate(() => {
        // This will trigger the nostr subscription
        console.log('[TEST] Iniciando test de suscripcion Nostr...');
        
        // Create a fake invoice to test
        const testInvoice = 'lnbc10n1p0test';
        
        // We can verify the subscription code runs by checking logs
        window.testInvoiceTracker = new window.InvoiceTracker(
          testInvoice,
          (status, data) => {
            console.log('[TEST] Status callback:', status, data);
          },
          { 
            paymentHash: 'test123456789012345678901234567890123456789012345678901234567890',
            recipientPubkey: '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245'
          }
        );
        
        console.log('[TEST] InvoiceTracker creado, iniciando...');
        window.testInvoiceTracker.start(5000, 30000);
      });
      
      await page.waitForTimeout(8000);
      
      console.log('\n📋 Logs relevantes:');
      const relevantLogs = logs.filter(l => 
        l.includes('[InvoiceTracker]') || 
        l.includes('[TEST]') ||
        l.includes('Nostr') || 
        l.includes('subscription') ||
        l.includes('zap')
      );
      relevantLogs.forEach(l => console.log(`  - ${l}`));
      
      // Cleanup
      await page.evaluate(() => {
        if (window.testInvoiceTracker) {
          window.testInvoiceTracker.stop();
        }
      });
    } else {
      console.log('   ⚠️ No hay botones de zap visibles');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Test completo\n');
}

runTest().catch(console.error);
