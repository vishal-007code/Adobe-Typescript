import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { appendCsvRow } from './csv';
import { loadConsumedLedgerRows, normalizeAdobeEmail } from './accounts';
import {
  ADOBE_ACCOUNT_ATTACHMENT,
  ADOBE_CONSUMED_HEADERS,
  ADOBE_LINK_ATTACHMENT,
  ADOBE_RESULTS_HEADERS,
  ADOBE_STEP_ATTACHMENT,
  getAdobeConsumedLedgerPath,
  getAdobeResultsPathForRun,
  requireAdobeRunId,
} from './runtime';
import type { AdobeResultStatus } from './types';

export default class AdobeCsvReporter implements Reporter {
  private readonly resultsPath: string;
  private readonly consumedLedgerPath: string;
  private readonly seenEmails = new Set<string>();

  constructor() {
    const runId = requireAdobeRunId();
    this.resultsPath = getAdobeResultsPathForRun(runId);
    this.consumedLedgerPath = getAdobeConsumedLedgerPath();

    // Pre-load already-consumed emails so we never write duplicates to the ledger.
    for (const row of loadConsumedLedgerRows(this.consumedLedgerPath)) {
      const normalized = normalizeAdobeEmail(row.email);
      if (normalized) this.seenEmails.add(normalized);
    }
  }

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!isAdobeProjectTest(test)) return;

    const accountMetadata = readJsonAttachment<{ email?: string }>(result, ADOBE_ACCOUNT_ATTACHMENT);
    const stepMetadata = readJsonAttachment<{ lastStep?: string }>(result, ADOBE_STEP_ATTACHMENT);
    const linkMetadata = readJsonAttachment<{ publishedLink?: string }>(result, ADOBE_LINK_ATTACHMENT);
    const mappedStatus = mapStatus(result.status);
    const email = accountMetadata?.email?.trim().toLowerCase() ?? '';

    // Write result row immediately — visible in the CSV as each test finishes.
    appendCsvRow(this.resultsPath, ADOBE_RESULTS_HEADERS, [
      result.startTime.toISOString(),
      email,
      mappedStatus,
      mappedStatus === 'failed' ? stepMetadata?.lastStep?.trim() ?? '' : '',
      getFailureReason(test, result, mappedStatus),
      String(result.duration),
      linkMetadata?.publishedLink?.trim() ?? '',
    ]);

    // Mark account consumed once, regardless of pass/fail.
    if (email) {
      const normalized = normalizeAdobeEmail(email);
      if (normalized && !this.seenEmails.has(normalized)) {
        this.seenEmails.add(normalized);
        appendCsvRow(this.consumedLedgerPath, ADOBE_CONSUMED_HEADERS, [
          normalized,
          result.startTime.toISOString(),
        ]);
      }
    }
  }

  onEnd(_result: FullResult): void {
    // All rows were written in real-time in onTestEnd — nothing to merge.
  }
}

function isAdobeProjectTest(test: TestCase): boolean {
  return test.titlePath()[1] === 'adobe-chromium';
}

function mapStatus(status: TestResult['status']): AdobeResultStatus {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  return 'failed';
}

function readJsonAttachment<T>(result: TestResult, name: string): T | undefined {
  const attachment = result.attachments.find(
    (candidate) => candidate.name === name && candidate.contentType === 'application/json',
  );
  if (!attachment?.body) return undefined;
  return JSON.parse(attachment.body.toString('utf8')) as T;
}

function getFailureReason(test: TestCase, result: TestResult, mappedStatus: AdobeResultStatus): string {
  if (mappedStatus === 'passed') return '';

  if (mappedStatus === 'skipped') {
    const skipAnnotation = result.annotations.find((a) => a.type === 'skip');
    return skipAnnotation?.description ?? test.annotations.find((a) => a.type === 'skip')?.description ?? '';
  }

  return formatError(result.error ?? result.errors[0]);
}

function formatError(error: { message?: string; value?: string } | undefined): string {
  if (!error) return '';
  const message = error.message?.trim();
  if (message) return message.replace(/\s+/g, ' ');
  const value = error.value?.trim();
  if (value) return value.replace(/\s+/g, ' ');
  return '';
}
