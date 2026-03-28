import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';

async function screenshot(page, path, waitFor = null) {
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {});
  }
  await page.screenshot({ path, fullPage: false });
  console.log(`Captured: ${path}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 01_home.png - Home page
  await page.goto(BASE_URL + '/');
  await page.waitForTimeout(2000);
  await screenshot(page, 'screenshots/01_home.png');

  // 02_login_form.png - Login form (click connect button)
  await page.click('#user-menu-connect');
  await page.waitForTimeout(500);
  await screenshot(page, 'screenshots/02_login_form.png');

  // Mock NIP-07 extension for screenshot 3
  await page.evaluate(() => {
    window.nostr = {
      getPublicKey: async () => 'abcd1234567890abcdef',
      signEvent: async (event) => { event.sig = 'mock_signature'; return event; }
    };
    window.dispatchEvent(new Event('nostr'));
  });
  await page.waitForTimeout(1000);

  // 03_nostr_trigger.png - Extension option visible (if NIP-07 available)
  await page.waitForTimeout(500);
  await screenshot(page, 'screenshots/03_nostr_trigger.png');

  // 03b_qr_modal.png - QR modal from Nostr Connect button
  await page.click('#nostrconnect-btn');
  await page.waitForTimeout(3000);
  await screenshot(page, 'screenshots/03b_qr_modal.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 04_nsec_filled.png - nsec input filled (we'll skip filling for now)
  await page.click('#user-menu-connect');
  await page.waitForTimeout(500);
  await page.fill('#login-unified-input', 'nsec197dzw28nja08vdu5jzg77kduxff0l35as6dsy0v0w9ld9pu9ggdqu0w2hf');
  await screenshot(page, 'screenshots/04_nsec_filled.png');

  // 05_after_login.png - After clicking connect
  await page.click('#connect-unified-btn');
  await page.waitForTimeout(3000);
  await screenshot(page, 'screenshots/05_after_login.png');

  // Set teacher role for remaining screenshots
  await page.evaluate(() => {
    localStorage.setItem('nosteach_roles', JSON.stringify({ teacher: true, student: true, sponsor: true }));
  });
  await page.reload();
  await page.waitForTimeout(2000);

  // 06_courses_list.png - Navigate to courses
  await page.click('text=Explorar');
  await page.waitForTimeout(5000);
  await screenshot(page, 'screenshots/06_courses_list.png');

  // 07_course_detail_direct.png - Click first course
  await page.waitForTimeout(3000);
  const courseLinks = await page.$$('h3 a, .course-card a, [class*="course"] a');
  if (courseLinks.length > 0) {
    await courseLinks[0].click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'screenshots/07_course_detail_direct.png');
  } else {
    await page.goto(BASE_URL + '/#/c');
    await page.waitForTimeout(3000);
    await screenshot(page, 'screenshots/07_course_detail_direct.png');
  }

  // 08_course_create_form.png - Navigate to create course
  await page.click('text=Crear Curso');
  await page.waitForTimeout(2000);
  await screenshot(page, 'screenshots/08_course_create_form.png');

  // 09_account_page.png - Navigate to account and wait for data to load
  await page.goto(BASE_URL + '/#/p');
  await page.waitForSelector('#user-menu-btn', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await screenshot(page, 'screenshots/09_account_page.png');

  // 10_roles_page.png - Navigate to roles via dropdown
  await page.click('#user-menu-btn');
  await page.waitForTimeout(500);
  await page.click('#menu-roles');
  await page.waitForTimeout(1000);
  await screenshot(page, 'screenshots/10_roles_page.png');

  // 11_home_complete.png - Back to home
  await page.goto(BASE_URL + '/');
  await page.waitForTimeout(1000);
  await screenshot(page, 'screenshots/11_home_complete.png');

  await browser.close();
  console.log('All screenshots captured!');
}

main().catch(console.error);
