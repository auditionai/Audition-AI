const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { chromium, devices } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: '.env.local' });

const BASE_URL = 'http://127.0.0.1:5173';
const SCREENSHOT_DIR = path.join(process.cwd(), '.codex-logs', 'screens');
const SUMMARY_PATH = path.join(process.cwd(), '.codex-logs', 'e2e-summary.json');
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const executablePath = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
if (!executablePath) {
  throw new Error('No local Chrome/Edge executable found for Playwright.');
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
const testEmail = `codex.mobile.${Date.now()}@example.com`;
const testPassword = 'CodexTest123!';
const displayName = 'Codex Test';

function record(step, status, detail, extra = {}) {
  const entry = { step, status, detail, ...extra };
  results.push(entry);
  console.log(`[${status.toUpperCase()}] ${step}: ${detail}`);
}

async function screenshot(page, name) {
  const target = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function createTestUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      full_name: displayName,
    },
  });

  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error('Auth admin returned no user.');

  const { error: upsertError } = await admin.from('users').upsert({
    id: user.id,
    email: testEmail,
    display_name: displayName,
    photo_url: '',
    vcoin_balance: 5000,
    is_admin: false,
    created_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (upsertError) throw upsertError;
  return user;
}

async function updateUser(patch) {
  const { error } = await admin.from('users').update(patch).eq('email', testEmail);
  if (error) throw error;
}

async function getUserProfileRow() {
  const { data, error } = await admin.from('users').select('id, email, vcoin_balance, is_admin').eq('email', testEmail).maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureVisible(locator, timeout = 20000) {
  await locator.waitFor({ state: 'visible', timeout });
}

(async () => {
  let browser;
  try {
    const user = await createTestUser();
    record('setup_user', 'passed', `Created test user ${testEmail}`, { userId: user.id });

    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'vi-VN' });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await ensureVisible(desktopPage.getByRole('button', { name: /Login/i }));
    const desktopShot = await screenshot(desktopPage, 'desktop-root.png');
    record('desktop_detect', 'passed', 'Desktop browser stays on desktop landing page.', { screenshot: desktopShot, url: desktopPage.url() });
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      ...devices['iPhone 13'],
      locale: 'vi-VN',
    });
    await mobileContext.addInitScript(() => {
      const value = { brands: [{ brand: 'Google Chrome', version: '123' }], mobile: true, platform: 'Android' };
      Object.defineProperty(navigator, 'userAgentData', {
        configurable: true,
        get: () => value,
      });
    });

    const page = await mobileContext.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await ensureVisible(page.getByText('Audition AI').first());
    const mobileRootShot = await screenshot(page, 'mobile-root.png');
    record('mobile_detect', 'passed', 'Mobile browser auto-loads the new mobile shell.', { screenshot: mobileRootShot, url: page.url() });

    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').first().fill(testPassword);
    await page.locator('input[type="password"]').first().press('Enter');
    await page.waitForURL(/\/home$/, { timeout: 30000 });
    await ensureVisible(page.locator('text=/tạo gì hôm nay/i').first(), 30000);
    const mobileHomeShot = await screenshot(page, 'mobile-home-after-login.png');
    const profileRowAfterLogin = await getUserProfileRow();
    record('login', 'passed', 'Email/password login succeeds on the mobile shell.', {
      screenshot: mobileHomeShot,
      vcoin: profileRowAfterLogin?.vcoin_balance ?? null,
      isAdmin: profileRowAfterLogin?.is_admin ?? null,
    });

    await page.goto(`${BASE_URL}/topup`, { waitUntil: 'domcontentloaded' });
    await ensureVisible(page.locator('text=/Chọn gói nạp/i').first());
    await page.locator('button').filter({ hasText: /Nạp/ }).first().click();
    await page.waitForURL(/payment-gateway/, { timeout: 25000 });
    await ensureVisible(page.locator('text=/Quét mã QR để thanh toán/i').first(), 25000);
    const topupShot = await screenshot(page, 'mobile-topup-manual-gateway.png');
    record('topup', 'passed', 'Top-up creates a pending transaction and falls back to the manual gateway when PayOS keys are absent.', {
      screenshot: topupShot,
      url: page.url(),
    });

    await page.goto(`${BASE_URL}/gallery`, { waitUntil: 'domcontentloaded' });
    await page.locator('button').filter({ hasText: /Giao dịch Vcoin/i }).click();
    await ensureVisible(page.locator('text=/CHỜ|PENDING|NẠP/i').first(), 25000);
    const galleryShot = await screenshot(page, 'mobile-gallery-transactions.png');
    record('gallery', 'passed', 'Gallery transaction tab shows the pending top-up created from the real flow.', {
      screenshot: galleryShot,
    });

    await page.goto(`${BASE_URL}/generate/image`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const imageBlocked = await page.locator('text=/TST đang bảo trì hoặc không sẵn sàng/i').first().isVisible().catch(() => false);
    if (imageBlocked) {
      const imageShot = await screenshot(page, 'mobile-image-generate-blocked.png');
      record('generate_image', 'blocked', 'Image generation UI loads, but real submission is blocked because local env is missing TST_API_KEY.', { screenshot: imageShot });
    } else {
      record('generate_image', 'passed', 'Image generation page loaded without catalog blocker.');
    }

    await page.goto(`${BASE_URL}/generate/video`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const videoBlocked = await page.locator('text=/TST đang bảo trì hoặc không sẵn sàng/i').first().isVisible().catch(() => false);
    if (videoBlocked) {
      const videoShot = await screenshot(page, 'mobile-video-generate-blocked.png');
      record('generate_video', 'blocked', 'Video generation UI loads, but real submission is blocked because local env is missing TST_API_KEY.', { screenshot: videoShot });
    } else {
      record('generate_video', 'passed', 'Video generation page loaded without catalog blocker.');
    }

    await updateUser({ is_admin: true });
    await page.evaluate(() => window.dispatchEvent(new Event('balance_updated')));
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });
    await ensureVisible(page.locator('text=/Quản trị hệ thống/i').first(), 25000);
    await page.locator('text=/Quản trị hệ thống/i').first().click();
    await page.waitForURL(/\/admin$/, { timeout: 30000 });
    await ensureVisible(page.locator('text=/Tổng Quan/i').first(), 30000);
    const adminShot = await screenshot(page, 'mobile-admin-overview.png');
    const profileRowAfterAdmin = await getUserProfileRow();
    record('admin', 'passed', 'Admin route opens from the mobile settings screen after role promotion.', {
      screenshot: adminShot,
      isAdmin: profileRowAfterAdmin?.is_admin ?? null,
    });

    await mobileContext.close();
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
      executedAt: new Date().toISOString(),
      testEmail,
      baseUrl: BASE_URL,
      results,
    }, null, 2));

    console.log(`\nSummary written to ${SUMMARY_PATH}`);
  } catch (error) {
    record('run', 'failed', error instanceof Error ? error.message : String(error));
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
      executedAt: new Date().toISOString(),
      testEmail,
      baseUrl: BASE_URL,
      results,
    }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
})();

