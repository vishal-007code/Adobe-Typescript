import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { createAdobeRunId } from './src/adobe/runtime';

const adobeRunId = process.env.ADOBE_RUN_ID?.trim() || createAdobeRunId();
const adobeLowNetworkDebugEnabled = process.env.ADOBE_LOW_NETWORK_DEBUG?.trim() === '1';
const adobeDebugSpecPattern = /tests[\\/]adobe[\\/].+\.low-network\.debug\.spec\.ts$/;
process.env.ADOBE_RUN_ID = adobeRunId;

// ──────────────────────────────────────────────────────────────────────────
// Bulk-run knobs — edit these two lines directly (no terminal variables needed).
//
//   BULK = true   → large account sweeps: traces off, more workers (faster).
//   BULK = false  → debugging: traces retained on failure, default worker count.
//
// Tests are network-bound (idle-waiting on Adobe), so WORKERS can safely exceed
// CPU core count. Watch RAM (~300-600MB per Chromium) and lower if it thrashes.
const BULK = true;
// Sweet spot is near physical core count (~6 here), NOT logical (12): the Adobe SPA
// has CPU/network-heavy bursts (app boot, editor load, generation) where concurrent
// workers contend and page loads slow down, pushing steps toward their timeouts.
// 4-6 is the realistic range on a 6-core/16GB box; tune empirically (see note below).
const WORKERS = 3;
// ──────────────────────────────────────────────────────────────────────────
// GPU MODE — Adobe Express shows "Performance limitations detected" (which stalls
// the publish/link spinner) when it can't get GPU acceleration.
//
//   'off'      → default headless SHELL: software rendering, NO GPU (triggers banner)
//   'headed'   → visible window using the real GPU; 1 worker, for a clean yes/no test
//   'headless' → new headless mode (channel:'chromium') WITH the GPU — no window,
//                GPU-capable, usable for bulk. THIS is the GPU-powered headless option.
//
// Why 'off' has no GPU: plain `headless:true` runs Chromium's lightweight headless
// SHELL, which renders in software. GPU needs the FULL browser in new headless mode,
// which Playwright selects via `channel: 'chromium'`.
const GPU_MODE = 'headless' as 'off' | 'headed' | 'headless';
// ──────────────────────────────────────────────────────────────────────────

// Windows: '--use-angle=d3d11' routes WebGL through DirectX (best GPU path here);
// '--ignore-gpu-blocklist' forces GPU even if the card is blocklisted by Chromium.
const GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', '--enable-webgl', '--use-angle=d3d11'];

const adobeWorkers = GPU_MODE === 'headed' ? 1 : (BULK ? WORKERS : undefined);
const adobeLaunchOptions = GPU_MODE === 'off' ? undefined : { args: GPU_ARGS };

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : adobeWorkers,
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
    trace: BULK ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: GPU_MODE !== 'headed',
    channel: GPU_MODE === 'headless' ? 'chromium' : undefined,
    launchOptions: adobeLaunchOptions,
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
