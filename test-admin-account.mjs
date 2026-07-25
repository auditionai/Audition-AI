import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  console.log('📱 Opening Audition AI at http://localhost:5173/');
  await page.goto('http://localhost:5173/');
  
  // Wait for page to load
  await page.waitForTimeout(3000);
  
  // Take screenshot of landing page
  await page.screenshot({ path: 'screenshots/01-landing-page.png', fullPage: true });
  console.log('✅ Screenshot: Landing page');
  
  // Keep browser open for manual testing
  console.log('\n🎯 Browser is ready for testing!');
  console.log('📝 You can now:');
  console.log('   1. Sign up/Login with Google');
  console.log('   2. Navigate through the app');
  console.log('   3. Test features');
  console.log('\n⚠️  Press Ctrl+C in terminal to close browser\n');
  
  // Keep running
  await page.waitForTimeout(300000); // 5 minutes
})();
