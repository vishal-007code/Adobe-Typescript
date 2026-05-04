# Adobe Test Authoring

Put real account-consuming specs in `tests/adobe/*.spec.ts`.

Use the helper from `src/adobe/spec.ts` so the file declares one Playwright test per fresh account at module load time.

```ts
import { defineAdobeAccountTests, expect } from '../../src/adobe/spec';

defineAdobeAccountTests('can reach the dashboard', async ({ page, account, stepTracker }) => {
  stepTracker.setStep('open login');
  await page.goto('https://example.com/login');

  stepTracker.setStep('submit credentials');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  stepTracker.setStep('verify dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

Keep these constraints in mind:

- Every declared Adobe test consumes exactly one account as soon as the browser context starts.
- Do not load accounts inside the test body or create your own pool.
- Always call `stepTracker.setStep(...)` before each meaningful business milestone so failures report the right step.
- Use the provided `account` fixture instead of reading `ADOBE_EMAIL` or CSV files directly inside the test.
- Keep retries disabled for this suite. A failed run still burns the account.
- If all accounts are already consumed, the helper declares one skipped test with reason `No fresh accounts available`.
