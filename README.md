# Adobe_V2

Playwright-based Adobe account flow automation with per-account test declaration, consumed-account tracking, HTML reporting, and CSV result output.

## What This Repo Does

- Runs Adobe browser flows with real accounts.
- Declares one Playwright test per fresh account at module load time.
- Marks accounts as consumed when a test context starts.
- Produces standard Playwright HTML output plus Adobe-specific CSV reports.
- Supports a dedicated low-network debug run for the copied Adobe spec.

## Requirements

- Node.js 18+
- npm
- Playwright browser dependencies installed for your environment

## Install

```bash
npm install
```

## Commands

```bash
npm run build
npm run test:adobe
npm run test:adobe:low-network
npm run test:infra
```

## Account Configuration

Adobe tests require accounts at declaration time. Configure one of these:

1. `ADOBE_ACCOUNTS_CSV=/absolute/or/relative/path/to/accounts.csv`
2. Repo-local `accounts.csv`
3. `ADOBE_EMAIL` and `ADOBE_PASSWORD`

The single-account env fallback is useful for quick validation. The CSV path is the normal multi-account path.

## Reporting

Adobe runs keep the same reporting behavior across normal and low-network execution:

- Playwright HTML report
- `reports/adobe_consumed_accounts.csv`
- `reports/adobe_results_<timestamp>.csv`

## Low-Network Debug Run

Use `npm run test:adobe:low-network` to run only `tests/adobe/script.low-network.debug.spec.ts`.

This path:

- Sets `ADOBE_LOW_NETWORK_DEBUG=1`
- Keeps the existing `adobe-chromium` project and reporters
- Applies a fixed Chromium CDP network throttle before the first Adobe navigation
- Preserves normal account consumption and CSV reporting

Normal `npm run test:adobe` runs exclude `*.low-network.debug.spec.ts` by default.

## Project Layout

```text
src/adobe/     Adobe account loading, fixtures, runtime, reporter, report merging
src/pages/     Page objects for Adobe and identity providers
tests/adobe/   Real account-consuming Adobe specs
tests/internal/Infrastructure tests for account sourcing and report merging
scripts/       Small operator-facing helper scripts
```

## Authoring Notes

- Use `defineAdobeAccountTests(...)` from `src/adobe/spec.ts` for Adobe specs.
- Call `stepTracker.setStep(...)` before meaningful business milestones.
- Do not load accounts directly inside specs or page objects.
- Keep retries disabled for the Adobe suite because a failed run still consumes the account.
