import type { Page } from '@playwright/test';

/**
 * Log what an identity provider actually served when an expected screen is missing.
 *
 * Without this, a blocked SSO login surfaces only as a bare locator timeout — e.g.
 * "waiting for getByLabel('Enter your password')" — which is actively misleading:
 * it names the element we wanted, not the page we got. A captcha, a "this browser
 * may not be secure" interstitial, an account-not-found and an IP block all look
 * identical from the outside. Cloud Run screenshots need SAVE_ARTIFACTS=true plus a
 * GCS round-trip, so the page identity has to reach stdout to be usable.
 *
 * Call ONLY on a failure path, and always rethrow the original error afterwards:
 * diagnostics must never mask the real failure or alter a passing run.
 *
 * Query strings are stripped because SSO URLs carry OAuth/SAML tokens.
 */
export async function logUnexpectedPage(page: Page, marker: string): Promise<void> {
  try {
    const url = page.url().split('?')[0];
    const title = (await page.title().catch(() => '')).replace(/"/g, "'");
    const body = (await page.locator('body')
      .innerText({ timeout: 5000 })
      .catch(() => ''))
      .replace(/\s+/g, ' ')
      .replace(/"/g, "'")
      .trim()
      .slice(0, 400);
    console.log(`[${marker}] url=${url} title="${title}" body="${body}"`);
  } catch {
    console.log(`[${marker}] page state unreadable`);
  }
}
