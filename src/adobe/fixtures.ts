import type { BrowserContextOptions, Page, TestInfo } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import { appendConsumedFragment } from './report-files';
import { ADOBE_ACCOUNT_ATTACHMENT, ADOBE_STEP_ATTACHMENT, requireAdobeRunId } from './runtime';
import type { AdobeAccount, StepTracker } from './types';

type AdobeTestOptions = {
  assignedAccount: AdobeAccount;
};

type AdobeFixtures = {
  account: AdobeAccount;
  stepTracker: StepTracker;
};

const CONTEXT_OPTION_KEYS = [
  'acceptDownloads',
  'baseURL',
  'bypassCSP',
  'clientCertificates',
  'colorScheme',
  'contrast',
  'deviceScaleFactor',
  'extraHTTPHeaders',
  'forcedColors',
  'geolocation',
  'hasTouch',
  'httpCredentials',
  'ignoreHTTPSErrors',
  'isMobile',
  'javaScriptEnabled',
  'locale',
  'offline',
  'permissions',
  'proxy',
  'recordHar',
  'recordVideo',
  'reducedMotion',
  'screen',
  'serviceWorkers',
  'storageState',
  'strictSelectors',
  'timezoneId',
  'userAgent',
  'viewport',
] as const;

export const test = base.extend<AdobeFixtures & AdobeTestOptions>({
  assignedAccount: [undefined as unknown as AdobeAccount, { option: true }],

  account: async ({ assignedAccount }, use, testInfo) => {
    assertAssignedAccount(assignedAccount, testInfo.title);

    await testInfo.attach(ADOBE_ACCOUNT_ATTACHMENT, {
      body: Buffer.from(JSON.stringify({ email: assignedAccount.email }), 'utf8'),
      contentType: 'application/json',
    });

    await use(assignedAccount);
  },

  stepTracker: async ({}, use, testInfo) => {
    let lastStep: string | undefined;
    const stepTracker: StepTracker = {
      setStep(step: string) {
        const normalized = step.trim();
        if (normalized) {
          lastStep = normalized;
        }
      },
      getStep() {
        return lastStep;
      },
    };

    await use(stepTracker);

    await testInfo.attach(ADOBE_STEP_ATTACHMENT, {
      body: Buffer.from(JSON.stringify({ lastStep: lastStep ?? '' }), 'utf8'),
      contentType: 'application/json',
    });
  },

  context: async ({ assignedAccount, browser }, use, testInfo) => {
    assertAssignedAccount(assignedAccount, testInfo.title);

    appendConsumedFragment(
      {
        email: assignedAccount.email,
        consumed_at: new Date().toISOString(),
      },
      {
        runId: requireAdobeRunId(),
        workerIndex: testInfo.workerIndex,
      },
    );

    const context = await browser.newContext(buildContextOptions(testInfo.project.use, testInfo.outputDir));
    try {
      await use(context);
    } finally {
      const pages = context.pages();
      await context.close();
      await attachContextVideos(pages, testInfo);
    }
  },
});

export { expect };

function assertAssignedAccount(account: AdobeAccount | undefined, testTitle: string): asserts account is AdobeAccount {
  if (!account) {
    throw new Error(`No Adobe account was assigned for "${testTitle}". Use test.use({ assignedAccount }) when declaring account-backed tests.`);
  }
}

function buildContextOptions(useOptions: Record<string, unknown>, outputDir: string): BrowserContextOptions {
  const contextOptions: Record<string, unknown> = {};
  for (const key of CONTEXT_OPTION_KEYS) {
    if (key === 'baseURL') {
      continue;
    }
    const value = useOptions[key];
    if (value !== undefined) {
      contextOptions[key] = value;
    }
  }
  if (!contextOptions.recordVideo && shouldRecordVideo(useOptions.video)) {
    contextOptions.recordVideo = {
      dir: outputDir,
    };
  }
  return contextOptions as BrowserContextOptions;
}

function shouldRecordVideo(videoSetting: unknown): boolean {
  if (videoSetting === 'off' || videoSetting === false || videoSetting === undefined || videoSetting === null) {
    return false;
  }
  return true;
}

async function attachContextVideos(pages: Page[], testInfo: TestInfo): Promise<void> {
  let index = 1;
  for (const page of pages) {
    const video = page.video();
    if (!video) {
      continue;
    }
    try {
      const path = await video.path();
      await testInfo.attach(`video-${index}`, {
        path,
        contentType: 'video/webm',
      });
      index += 1;
    } catch {
      // Ignore video attach failures; test result should still be reported.
    }
  }
}

export type { AdobeFixtures, AdobeTestOptions };
