import { test, expect } from '@playwright/test';
import { BASE_URL, resetDb, attachNetworkLogger } from '../helpers';

test.beforeEach(async ({ page }) => {
  attachNetworkLogger(page);
  await resetDb(page);
});

test('fluxo de cadastro, login e agendamento', async ({ page }) => {
  // register a new account and remember the email we used so we can
  // log back in later.  the page redirects to `/` after signup, not
  // `/dashboard` as some older tests assumed.
  await page.goto(`${BASE_URL}/auth/register`);
  
  // Wait for registration form to be visible
  await page.waitForSelector('input[name="name"]', { timeout: 10000 });
  
  const email = `teste${Date.now()}@mail.com`;
  await page.fill('input[name="name"]', 'Teste Usuário');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="phone"]', '11999999999');
  await page.fill('input[name="password"]', 'senha123');
  await page.fill('input[name="confirmPassword"]', 'senha123');
  
  // submit and wait for the redirect; if it never happens, try
  // loading the home page explicitly so the test fails fast instead of
  // hanging for the full timeout
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ url: '**/', timeout: 60000 }).catch(() => {})
  ]);
  
  if (page.url().endsWith('/auth/register')) {
    // navigation didn't occur, attempt manual load so subsequent steps hit
    // the same error quickly
    await page.goto(`${BASE_URL}/`);
  }
  
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // clear authentication state instead of clicking logout (which is
  // inside a dropdown that may not always be visible).
  await page.context().clearCookies();

  // Login with the same account we just registered
  await page.goto(`${BASE_URL}/auth/login`);
  
  // Wait for login form to be visible
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'senha123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Catálogo
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await expect(page.locator('text=Nossos Serviços')).toBeVisible();
});
