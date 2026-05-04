import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightCliPath = require.resolve('@playwright/test/cli');

const result = spawnSync(
  process.execPath,
  [
    playwrightCliPath,
    'test',
    '--project=adobe-chromium',
    'tests/adobe/script.low-network.debug.spec.ts',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ADOBE_LOW_NETWORK_DEBUG: '1',
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
