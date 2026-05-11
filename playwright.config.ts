import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { createAdobeRunId } from './src/adobe/runtime';

const adobeRunId = process.env.ADOBE_RUN_ID?.trim() || createAdobeRunId();
const adobeLowNetworkDebugEnabled = process.env.ADOBE_LOW_NETWORK_DEBUG?.trim() === '1';
const adobeDebugSpecPattern = /tests[\\/]adobe[\\/].+\.low-network\.debug\.spec\.ts$/;
const configuredWorkers = resolveWorkerCount(process.env.ADOBE_PLAYWRIGHT_WORKERS);
process.env.ADOBE_RUN_ID = adobeRunId;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: configuredWorkers ?? (process.env.CI ? 1 : undefined),
  reporter: [
    ['html'],
    [path.resolve(__dirname, 'src/adobe/reporter.ts')],
  ],
  timeout: 360_000,
  expect:{
    timeout: 120_000,
  },
  use: {
    actionTimeout: 120_000,
    navigationTimeout: 240_000,
    trace: 'on',
    headless: true,
  },
  projects: [
    {
      name: 'adobe-chromium',
      testMatch: adobeLowNetworkDebugEnabled
        ? adobeDebugSpecPattern
        : /tests[\\/]adobe[\\/].+\.spec\.ts/,
      testIgnore: adobeLowNetworkDebugEnabled ? undefined : adobeDebugSpecPattern,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'internal-chromium',
      testMatch: /tests[\\/]internal[\\/].+\.spec\.ts/,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

function resolveWorkerCount(rawValue: string | undefined): number | undefined {
  const value = rawValue?.trim();
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`ADOBE_PLAYWRIGHT_WORKERS must be a positive integer. Got "${rawValue}".`);
  }
  return parsed;
}
