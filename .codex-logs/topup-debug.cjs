const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'vi-VN' });
  await context.addInitScript(() => {
    const value = { brands: [{ brand: 'Google Chrome', version: '123' }], mobile: true, platform: 'Android' };
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, get: () => value });
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill('codex.mobile.1774537037595@example.com');
  await page.locator('input[type="password"]').first().fill('CodexTest123!');
  await page.locator('input[type="password"]').first().press('Enter');
  await page.waitForURL(/\/home$/, { timeout: 30000 });
  await page.goto('http://127.0.0.1:5173/topup', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const texts = await page.locator('button').evaluateAll((els) => els.map((el) => ({ text: el.textContent, cls: el.className }))); 
  console.log(JSON.stringify(texts, null, 2));
  await browser.close();
})();
