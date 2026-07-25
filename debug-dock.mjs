import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('http://localhost:5173/home');
  await page.waitForTimeout(3000);
  
  // Check if dock element exists
  const dock = await page.evaluate(() => {
    const dockEl = document.querySelector('[data-tour-id="desktop.layout.dock"]');
    if (!dockEl) return { exists: false };
    
    const styles = window.getComputedStyle(dockEl);
    const rect = dockEl.getBoundingClientRect();
    
    return {
      exists: true,
      display: styles.display,
      position: styles.position,
      bottom: styles.bottom,
      zIndex: styles.zIndex,
      visibility: styles.visibility,
      opacity: styles.opacity,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    };
  });
  
  console.log('🔍 Dock element debug info:');
  console.log(JSON.stringify(dock, null, 2));
  
  // Take screenshot
  await page.screenshot({ path: 'screenshots/02-home-with-dock-debug.png', fullPage: true });
  console.log('✅ Screenshot saved');
  
  await page.waitForTimeout(60000);
})();
