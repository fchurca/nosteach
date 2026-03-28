import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const URL = process.env.TEST_URL || 'http://localhost:5173';

let NSEC = process.env.TEST_NSEC;
if (!NSEC && existsSync('.secrets')) {
  const secrets = readFileSync('.secrets', 'utf-8');
  const match = secrets.match(/TEST_NSEC=(.+)/);
  if (match) NSEC = match[1];
}

if (!NSEC) {
  console.error('ERROR: TEST_NSEC not found. Set in .secrets or TEST_NSEC env var');
  process.exit(1);
}

async function testInvoiceProxy() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  
  console.log('1. Loading page and logging in...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.click('#user-menu-connect');
  await page.fill('#login-unified-input', NSEC);
  await page.click('#connect-unified-btn');
  await page.waitForTimeout(3000);
  
  console.log('2. Setting roles...');
  await page.click('#user-menu-btn');
  await page.waitForTimeout(500);
  await page.click('#menu-roles');
  await page.waitForTimeout(500);
  await page.click('#role-sponsor');
  await page.waitForTimeout(500);
  
  console.log('3. Going to courses...');
  await page.click('text=Ver Cursos');
  await page.waitForTimeout(5000);
  
  console.log('4. Looking for course with price...');
  const courseCards = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="course"], .card');
    for (const card of cards) {
      if (card.innerText.includes('21 sats') || card.innerText.includes('sats')) {
        return card.innerHTML;
      }
    }
    return null;
  });
  console.log('  Found course:', courseCards ? 'yes' : 'no');
  
  console.log('5. Checking all text on page...');
  const allText = await page.evaluate(() => document.body.innerText);
  console.log('  Page text:', allText.slice(0, 500));
  
  console.log('\n6. Checking for zap-related console logs...');
  const zapLogs = logs.filter(l => l.includes('Invoice') || l.includes('verify') || l.includes('proxy') || l.includes('checkWith'));
  zapLogs.forEach(l => console.log('  ', l));
  
  console.log('\n7. Testing InvoiceTracker directly...');
  await page.evaluate(() => {
    window.InvoiceTracker.prototype.checkWithLnurlp = async function() {
      console.log('[TEST] checkWithLnurlp called');
      console.log('[TEST] verifyUrl:', this.verifyUrl);
      
      let fetchUrl = this.verifyUrl;
      const urlObj = new URL(this.verifyUrl);
      const hostname = urlObj.hostname;
      
      if (hostname.includes('primal')) {
        console.log('[TEST] Primal detected, skipping');
        return null;
      }
      
      if (urlObj.origin !== window.location.origin) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const hash = pathParts[pathParts.length - 1];
        if (hash && /^[a-fA-F0-9]{64}$/.test(hash)) {
          fetchUrl = `/api/verify?hash=${hash}&provider=getalby`;
          console.log('[TEST] Using proxy:', fetchUrl);
        }
      }
      
      console.log('[TEST] Would fetch:', fetchUrl);
      return null;
    };
    
    const tracker = new window.InvoiceTracker('lnbc1test', () => {}, {
      verifyUrl: 'https://getalby.com/hello/verify/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });
    tracker.checkWithLnurlp();
  });
  
  await page.waitForTimeout(2000);
  
  const newLogs = logs.filter(l => l.includes('[TEST]'));
  console.log('  Test results:');
  newLogs.forEach(l => console.log('   ', l));
  
  await browser.close();
  
  console.log('\n✅ Test complete');
}

testInvoiceProxy().catch(e => console.error('Error:', e.message));