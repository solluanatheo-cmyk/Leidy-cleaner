import { Page } from '@playwright/test';

// base address used by all tests; can be overridden via env var
export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export async function resetDb(page: Page) {
  const url = 'http://127.0.0.1:3001/api/v1/test/reset';
  // retry a few times, giving the backend time to finish startup/migrations
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const res = await page.request.post(url);
      if (res.ok()) return;
      const text = await res.text();
      console.warn(`resetDb attempt ${attempt} returned ${res.status()}: ${text}`);
    } catch (err) {
      console.warn(`resetDb attempt ${attempt} error:`, err);
    }
    if (attempt < 12) await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('resetDb failed after multiple attempts');
}

export function attachNetworkLogger(page: Page) {
  page.on('requestfailed', request => {
    console.warn('request failed', request.url(), request.failure()?.errorText);
  });
}
