# Adobe_V2

Adobe account-flow automation built with Playwright and TypeScript.

This repository is designed for real, consumable Adobe credentials. Each fresh account becomes its own Playwright test, consumed accounts are tracked across runs, and every run produces both Playwright HTML output and Adobe-specific CSV artifacts.

## Features

- Real-account Adobe browser automation with Playwright
- One declared test per fresh account
- Automatic consumed-account tracking across runs
- CSV-based account sourcing with environment-variable fallback
- Custom Adobe run reporting alongside the Playwright HTML report
- Dedicated low-network debug entry point
- Internal infrastructure tests for the account and reporting pipeline

## Quick Start

### Requirements

- Node.js 18+
- npm
- Playwright browser dependencies for the local machine

### Install

```bash
npm install
npx playwright install
```

### Configure Accounts

Provide Adobe credentials using one of these sources, in this order:

1. `ADOBE_ACCOUNTS_CSV`
2. `./accounts.csv`
3. `ADOBE_EMAIL` and `ADOBE_PASSWORD`

Example CSV:

```csv
email,password
user1@example.com,secret-1
user2@example.com,secret-2
```

Example PowerShell setup:

```powershell
$env:ADOBE_ACCOUNTS_CSV="C:\path\to\accounts.csv"
npm run test:adobe
```

Single-account fallback:

```powershell
$env:ADOBE_EMAIL="user@example.com"
$env:ADOBE_PASSWORD="secret"
npm run test:adobe
```

### Run

```bash
npm run build
npm run test:adobe
```

## Available Scripts

```bash
npm run build
npm run test:adobe
npm run test:adobe:low-network
npm run test:infra
```

- `npm run build` compiles the TypeScript project with `tsc`.
- `npm run test:adobe` runs the main Adobe suite with the `adobe-chromium` Playwright project.
- `npm run test:adobe:low-network` runs the low-network debug spec only.
- `npm run test:infra` runs infrastructure-focused tests for account loading and report merging.

## Run on GCP

Use a Cloud Run Job to run the Adobe login flow in GCP until it prints `Login flow completed successfully`.

See [docs/gcp-cloud-run-job.md](./docs/gcp-cloud-run-job.md) for the Cloud Shell deployment steps.

## How It Works

Adobe tests are declared from available accounts before execution begins:

1. The suite loads accounts from CSV or environment variables.
2. Emails already present in `reports/adobe_consumed_accounts.csv` are filtered out.
3. One Playwright test is declared for each fresh account.
4. The account is marked consumed when its browser context starts.
5. Run fragments are merged into final CSV outputs when the suite finishes.

If no fresh accounts remain, the suite declares a single skipped test with the reason `No fresh accounts available`.

## Account Model

This repository treats Adobe accounts as consumable inputs, not reusable fixtures.

- A failed test still consumes the assigned account.
- Adobe retries remain disabled by design.
- Re-running the suite without refreshing accounts will skip previously consumed emails.
- Editing `reports/adobe_consumed_accounts.csv` changes future account eligibility.

Account-loading behavior:

- Emails are normalized to lowercase.
- Blank CSV rows are ignored.
- Duplicate emails are collapsed.
- If duplicate rows have different passwords, the first password wins and a warning is emitted.

## Reporting

Each Adobe run produces:

- `playwright-report/` for the standard Playwright HTML report
- `reports/adobe_consumed_accounts.csv` for the persistent consumed-account ledger
- `reports/adobe_results_<timestamp>.csv` for the merged Adobe run results

The Adobe results file contains:

- `timestamp`
- `email`
- `test_status`
- `failed_at_step`
- `failure_reason`
- `duration_ms`

Temporary per-worker fragments are written under `reports/.tmp/<ADOBE_RUN_ID>/` and removed after merge.

## Low-Network Debug Mode

Use the low-network path when you need to debug the dedicated throttled Adobe scenario:

```bash
npm run test:adobe:low-network
```

This mode:

- Sets `ADOBE_LOW_NETWORK_DEBUG=1`
- Reuses the `adobe-chromium` Playwright project
- Runs only `tests/adobe/script.low-network.debug.spec.ts`
- Preserves the same account-consumption and reporting behavior as the standard Adobe run

## Project Structure

```text
src/
  adobe/
    accounts.ts
    csv.ts
    fixtures.ts
    report-files.ts
    reporter.ts
    runtime.ts
    spec.ts
    types.ts
  pages/

tests/
  adobe/
  internal/

scripts/
```

Key directories:

- `src/adobe/` contains account loading, fixtures, runtime helpers, and reporter logic.
- `src/pages/` contains Adobe and identity-provider page objects.
- `tests/adobe/` contains real account-consuming specs.
- `tests/internal/` contains infrastructure tests for account and reporting behavior.
- `scripts/` contains small operator-facing helpers.

## Authoring Tests

Put Adobe account-consuming specs in `tests/adobe/*.spec.ts` and use [`defineAdobeAccountTests`](./src/adobe/spec.ts).

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

Rules for Adobe specs:

- Use the provided `account` fixture instead of loading credentials directly.
- Call `stepTracker.setStep(...)` before meaningful business milestones.
- Do not build your own account pool inside a spec.
- Do not enable retries for account-consuming Adobe tests.

Additional authoring guidance lives in [tests/adobe/README.md](./tests/adobe/README.md).

## Development Notes

- The Playwright config currently runs Chromium headed by default.
- Timeouts are intentionally high to accommodate slower Adobe and identity-provider flows.
- `accounts.csv`, `reports/`, Playwright artifacts, and other local runtime data are ignored by Git.

## License

No license file is currently included in this repository.
