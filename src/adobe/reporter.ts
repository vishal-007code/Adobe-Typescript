import type { FullResult, Reporter, TestCase, TestError, TestResult } from '@playwright/test/reporter';
import { appendResultFragment, mergeAdobeRunArtifacts } from './report-files';
import { ADOBE_ACCOUNT_ATTACHMENT, ADOBE_STEP_ATTACHMENT, requireAdobeRunId } from './runtime';
import type { AdobeResultStatus } from './types';

export default class AdobeCsvReporter implements Reporter {
  private readonly runId = requireAdobeRunId();
  private sawAdobeSuiteTest = false;

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!isAdobeProjectTest(test)) {
      return;
    }

    this.sawAdobeSuiteTest = true;
    const accountMetadata = readJsonAttachment<{ email?: string }>(result, ADOBE_ACCOUNT_ATTACHMENT);
    const stepMetadata = readJsonAttachment<{ lastStep?: string }>(result, ADOBE_STEP_ATTACHMENT);
    const mappedStatus = mapStatus(result.status);

    appendResultFragment(
      {
        timestamp: result.startTime.toISOString(),
        email: accountMetadata?.email?.trim().toLowerCase() ?? '',
        test_status: mappedStatus,
        failed_at_step: mappedStatus === 'failed' ? stepMetadata?.lastStep?.trim() ?? '' : '',
        failure_reason: getFailureReason(test, result, mappedStatus),
        duration_ms: String(result.duration),
      },
      {
        runId: this.runId,
        workerIndex: result.workerIndex >= 0 ? result.workerIndex : result.parallelIndex,
      },
    );
  }

  async onEnd(result: FullResult): Promise<void> {
    if (!this.sawAdobeSuiteTest) {
      return;
    }

    mergeAdobeRunArtifacts({
      finishedAt: new Date(),
      runId: this.runId,
    });

    if (result.status === 'timedout') {
      return;
    }
  }
}

function isAdobeProjectTest(test: TestCase): boolean {
  return test.titlePath()[1] === 'adobe-chromium';
}

function mapStatus(status: TestResult['status']): AdobeResultStatus {
  if (status === 'passed') {
    return 'passed';
  }
  if (status === 'skipped') {
    return 'skipped';
  }
  return 'failed';
}

function readJsonAttachment<T>(result: TestResult, name: string): T | undefined {
  const attachment = result.attachments.find(
    (candidate) => candidate.name === name && candidate.contentType === 'application/json',
  );

  if (!attachment) {
    return undefined;
  }

  const body = attachment.body;
  if (!body) {
    return undefined;
  }

  return JSON.parse(body.toString('utf8')) as T;
}

function getFailureReason(test: TestCase, result: TestResult, mappedStatus: AdobeResultStatus): string {
  if (mappedStatus === 'passed') {
    return '';
  }

  if (mappedStatus === 'skipped') {
    const skipAnnotation = result.annotations.find((annotation) => annotation.type === 'skip');
    return skipAnnotation?.description ?? test.annotations.find((annotation) => annotation.type === 'skip')?.description ?? '';
  }

  return formatError(result.error ?? result.errors[0]);
}

function formatError(error: TestError | undefined): string {
  if (!error) {
    return '';
  }

  const message = error.message?.trim();
  if (message) {
    return message.replace(/\s+/g, ' ');
  }

  const value = error.value?.trim();
  if (value) {
    return value.replace(/\s+/g, ' ');
  }

  return '';
}
