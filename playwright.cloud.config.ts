import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { createAdobeRunId } from './src/adobe/runtime';

const adobeRunId = process.env.ADOBE_RUN_ID?.trim() || createAdobeRunId();
process.env.ADOBE_RUN_ID = adobeRunId;

const WORKERS = parseInt(process.env.WORKERS ?? '3', 10);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: false,
  retries: 0,
  workers: WORKERS,
  reporter: [
    ['html'],
    [path.resolve(__dirname, 'src/adobe/reporter.ts')],
  ],
  timeout: 360_000,
  expect: {
    timeout: 120_000,
  },
  use: {
    actionTimeout: 120_000,
    navigationTimeout: 240_000,
    trace: 'off',
    screenshot: 'only-on-failure',
    headless: true,
    // Linux/Cloud Run compatible args — no GPU, no D3D11 (Windows-only)
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  },
  projects: [
    {
      name: 'adobe-chromium',
      testMatch: /tests[\\/]adobe[\\/].+\.spec\.ts/,
      testIgnore: /tests[\\/]adobe[\\/].+\.low-network\.debug\.spec\.ts$/,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
