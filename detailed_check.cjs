const { chromium } = require('playwright');

async function detailedCheck() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());

  const results = {};
  
  // 1. Check contrast ratios
  console.log('\n=== 1. ACCESSIBILITY CHECK ===');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Get computed colors
  const colors = await page.evaluate(() => {
    const body = document.body;
    const h1 = document.querySelector('h1');
    const card = document.querySelector('.card');
    const btn = document.querySelector('button');
    
    return {
      bodyBg: window.getComputedStyle(body).background,
      h1Color: h1 ? window.getComputedStyle(h1).color : null,
      cardBg: card ? window.getComputedStyle(card).background : null,
      cardBorder: card ? window.getComputedStyle(card).borderColor : null,
      btnBg: btn ? window.getComputedStyle(btn).background : null,
      btnColor: btn ? window.getComputedStyle(btn).color : null,
      fontFamily: window.getComputedStyle(body).fontFamily,
      fontSize: window.getComputedStyle(body).fontSize,
      lineHeight: window.getComputedStyle(body).lineHeight
    };
  });
  results.colors = colors;
  console.log('Colors:', JSON.stringify(colors, null, 2));

  // 2. Check spacing and dimensions
  console.log('\n=== 2. SPACING & DIMENSIONS ===');
  const spacing = await page.evaluate(() => {
    const container = document.querySelector('.container');
    const card = document.querySelector('.card');
    const inputs = document.querySelectorAll('input');
    
    return {
      containerWidth: container ? window.getComputedStyle(container).maxWidth : null,
      containerPadding: container ? window.getComputedStyle(container).padding : null,
      cardPadding: card ? window.getComputedStyle(card).padding : null,
      cardBorderRadius: card ? window.getComputedStyle(card).borderRadius : null,
      inputPadding: inputs[0] ? window.getComputedStyle(inputs[0]).padding : null,
      h1FontSize: window.getComputedStyle(document.querySelector('h1')).fontSize
    };
  });
  results.spacing = spacing;
  console.log('Spacing:', JSON.stringify(spacing, null, 2));

  // 3. Check all text content for language issues
  console.log('\n=== 3. TEXT CONTENT ANALYSIS ===');
  const allText = await page.evaluate(() => {
    const elements = document.querySelectorAll('h1, h2, h3, p, button, label, a, span, li');
    return Array.from(elements).map(el => el.textContent.trim()).filter(t => t).slice(0, 50);
  });
  results.allText = allText;
  console.log('Text found:', allText);

  // 4. Check interactive elements
  console.log('\n=== 4. INTERACTIVE ELEMENTS ===');
  const interactive = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    const inputs = document.querySelectorAll('input, textarea, select');
    const links = document.querySelectorAll('a[href]');
    
    return {
      buttonCount: buttons.length,
      inputCount: inputs.length,
      linkCount: links.length,
      buttons: buttons.map(b => ({ text: b.textContent.trim(), disabled: b.disabled, classes: b.className })),
      inputs: inputs.map(i => ({ type: i.type, placeholder: i.placeholder, name: i.name, required: i.required }))
    };
  });
  results.interactive = interactive;
  console.log('Buttons:', interactive.buttons.length);
  console.log('Inputs:', interactive.inputs.length);

  // 5. Check responsive behavior
  console.log('\n=== 5. RESPONSIVE BREAKPOINTS ===');
  const breakpoints = [375, 768, 1024, 1280];
  for (const width of breakpoints) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(500);
    const visible = await page.evaluate(() => {
      const grid = document.querySelector('.grid');
      const nav = document.querySelector('nav');
      return {
        gridColumns: grid ? window.getComputedStyle(grid).gridTemplateColumns : null,
        navFlex: nav ? window.getComputedStyle(nav).flexDirection : null,
        hasHorizontalScroll: document.body.scrollWidth > document.body.clientWidth
      };
    });
    console.log(`  ${width}px:`, JSON.stringify(visible));
  }

  // 6. Check form validation
  console.log('\n=== 6. FORM VALIDATION ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  
  // Navigate to courses/create (we know this shows the form only for teachers)
  // Let's try the login form instead
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  const loginBtn = await page.$('button:has-text("Iniciar")');
  if (loginBtn) {
    await loginBtn.click();
    await page.waitForTimeout(1000);
  }
  
  const formValidation = await page.evaluate(() => {
    const form = document.querySelector('form');
    const inputs = document.querySelectorAll('input[required]');
    return {
      hasForm: !!form,
      requiredInputs: inputs.length,
      requiredFields: Array.from(inputs).map(i => i.name || i.placeholder)
    };
  });
  results.formValidation = formValidation;
  console.log('Form validation:', JSON.stringify(formValidation, null, 2));

  // 7. Check loading states
  console.log('\n=== 7. LOADING STATES ===');
  await page.goto('http://localhost:5173/courses', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  
  const loadingCheck = await page.evaluate(() => {
    const loading = document.querySelector('[class*="loading"], [class*="skeleton"], [class*="spinner"]');
    const empty = document.querySelector('[class*="empty"], [class*="no-data"]');
    const error = document.querySelector('[class*="error"]');
    return {
      hasLoading: !!loading,
      hasEmpty: !!empty,
      hasError: !!error,
      bodyText: document.body.textContent.substring(0, 200)
    };
  });
  results.loadingStates = loadingCheck;
  console.log('Loading states:', JSON.stringify(loadingCheck, null, 2));

  await browser.close();
  
  const fs = require('fs');
  fs.writeFileSync('/var/lib/opencode/workspace/lightning-starter/detailed_results.json', JSON.stringify(results, null, 2));
  console.log('\n=== DETAILED CHECK COMPLETE ===');
}

detailedCheck().catch(console.error);
