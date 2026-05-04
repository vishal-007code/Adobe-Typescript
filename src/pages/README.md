# Page Objects

Store page classes in `src/pages/`.

Recommended structure:

- `tests/adobe/*.spec.ts` for test declarations
- `src/pages/` for one class per actual page
- `src/flows/` for longer business journeys that coordinate multiple pages

Guidelines:

- Keep one page object focused on one page or one clear UI surface.
- Let specs own the scenario and assertions.
- Use page objects for actions, locators, and page-specific state checks.
- Do not load accounts or read CSV data inside page objects.
- Pass `account` data from the test layer when a page needs credentials or user data.
- Call `stepTracker.setStep(...)` around major business milestones so failures are reported clearly.
- Avoid one giant page object that spans the whole journey.
- If the flow crosses many pages, add a flow layer that orchestrates multiple page objects.

Example:

```ts
import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('https://example.com/login');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }
}
```

Typical usage from the spec:

```ts
import { defineAdobeAccountTests, expect } from '../../src/adobe/spec';
import { LoginPage } from '../../src/pages/LoginPage';

defineAdobeAccountTests('can sign in', async ({ page, account, stepTracker }) => {
  const loginPage = new LoginPage(page);

  stepTracker.setStep('open login');
  await loginPage.open();

  stepTracker.setStep('submit credentials');
  await loginPage.signIn(account.email, account.password);

  stepTracker.setStep('verify signed-in state');
  await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible();
});
```
