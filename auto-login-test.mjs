import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  console.log('📱 Opening Audition AI...');
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);
  
  // Take screenshot of landing
  await page.screenshot({ path: 'screenshots/03-landing-before-login.png' });
  console.log('✅ Landing page screenshot');
  
  console.log('🔑 Attempting to login with admin test account...');
  
  // Click LOGIN button
  const loginBtn = await page.locator('text=LOGIN').first();
  if (await loginBtn.isVisible()) {
    await loginBtn.click();
    await page.waitForTimeout(2000);
    
    // Check if there's email/password form or Google OAuth
    const emailInput = await page.locator('input[type="email"]').first();
    
    if (await emailInput.isVisible()) {
      console.log('📧 Found email login form');
      await emailInput.fill('admin.test@auditionai.vn');
      
      const passwordInput = await page.locator('input[type="password"]').first();
      await passwordInput.fill('Admin@Test2026!');
      
      // Click login button
      const submitBtn = await page.locator('button:has-text("Đăng nhập"), button:has-text("Login"), button[type="submit"]').first();
      await submitBtn.click();
      
      console.log('⏳ Waiting for authentication...');
      await page.waitForTimeout(3000);
    } else {
      console.log('📝 Please login manually via Google OAuth or email');
    }
  }
  
  // Take screenshot after login attempt
  await page.screenshot({ path: 'screenshots/04-after-login.png', fullPage: true });
  console.log('✅ After login screenshot');
  
  // Check if dock is visible
  const dockVisible = await page.evaluate(() => {
    const dock = document.querySelector('[data-tour-id="desktop.layout.dock"]');
    return dock !== null;
  });
  
  console.log(`\n🎯 Dock visible: ${dockVisible}`);
  
  if (!dockVisible) {
    console.log('\n⚠️  Dock not found! Possible reasons:');
    console.log('   1. Not logged in yet');
    console.log('   2. Still on landing page');
    console.log('   3. CSS/rendering issue');
  } else {
    console.log('\n✅ Dock is visible! You can now test the app.');
  }
  
  console.log('\n📝 Browser will stay open for 5 minutes for manual testing.');
  console.log('   Press Ctrl+C to close.\n');
  
  await page.waitForTimeout(300000);
})();
