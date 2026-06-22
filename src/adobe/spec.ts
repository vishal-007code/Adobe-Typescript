import type {
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestInfo,
} from '@playwright/test';
import type { AdobeFixtures, AdobeTestOptions } from './fixtures';
import type { AdobeAccount } from './types';
import { loadFreshAdobeAccounts } from './accounts';
import { test, expect } from './fixtures';
import { ADOBE_NO_FRESH_ACCOUNTS_REASON } from './runtime';

type AdobeTitle = string | ((account: AdobeAccount) => string);
type AdobeTestBody = (
  args: PlaywrightTestArgs &
    PlaywrightTestOptions &
    PlaywrightWorkerArgs &
    PlaywrightWorkerOptions &
    AdobeFixtures &
    AdobeTestOptions,
  testInfo: TestInfo,
) => Promise<void> | void;

export function defineAdobeAccountTests(title: AdobeTitle, body: AdobeTestBody): void {
  const { accounts, skipReason } = loadFreshAdobeAccounts();

  if (accounts.length === 0) {
    test.skip(skipReason ?? ADOBE_NO_FRESH_ACCOUNTS_REASON, async () => {});
    return;
  }

  for (const assignedAccount of accounts) {
    const resolvedTitle = typeof title === 'function' ? title(assignedAccount) : title;

    test.describe(assignedAccount.email, () => {
      test.use({ assignedAccount });
      test(resolvedTitle, body);
    });
  }
}

export { expect, test };
