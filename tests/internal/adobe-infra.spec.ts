import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { AdobeConfigurationError, loadFreshAdobeAccounts, resolveAdobeAccountSource } from '../../src/adobe/accounts';
import { appendConsumedFragment, appendResultFragment, mergeAdobeRunArtifacts } from '../../src/adobe/report-files';
import { ADOBE_NO_FRESH_ACCOUNTS_REASON } from '../../src/adobe/runtime';

test.describe('Adobe account sourcing', () => {
  test('prefers ADOBE_ACCOUNTS_CSV over repo-local CSV and env fallback', async () => {
    const tempDir = createTempDir();
    const explicitCsv = path.join(tempDir, 'explicit.csv');
    const localCsv = path.join(tempDir, 'accounts.csv');

    fs.writeFileSync(explicitCsv, 'email,password\nexplicit@example.com,secret\n', 'utf8');
    fs.writeFileSync(localCsv, 'email,password\nlocal@example.com,secret\n', 'utf8');

    const source = resolveAdobeAccountSource({
      cwd: tempDir,
      env: {
        ADOBE_ACCOUNTS_CSV: './explicit.csv',
        ADOBE_EMAIL: 'env@example.com',
        ADOBE_PASSWORD: 'secret',
      },
    });

    expect(source.kind).toBe('csv');
    if (source.kind !== 'csv') {
      throw new Error('Expected CSV source.');
    }
    expect(source.path).toBe(explicitCsv);
  });

  test('falls back to a single env account when CSV sources are absent', async () => {
    const tempDir = createTempDir();
    const result = loadFreshAdobeAccounts({
      cwd: tempDir,
      env: {
        ADOBE_EMAIL: ' Single@Example.com ',
        ADOBE_PASSWORD: 'secret',
      },
    });

    expect(result.accounts).toEqual([
      {
        email: 'single@example.com',
        password: 'secret',
      },
    ]);
  });

  test('fails clearly when account configuration is missing', async () => {
    const tempDir = createTempDir();

    expect(() => loadFreshAdobeAccounts({ cwd: tempDir, env: {} })).toThrow(AdobeConfigurationError);
    expect(() => loadFreshAdobeAccounts({ cwd: tempDir, env: {} })).toThrow(
      /Set ADOBE_ACCOUNTS_CSV, add accounts\.csv, or set ADOBE_EMAIL and ADOBE_PASSWORD/,
    );
  });

  test('dedupes duplicate logical emails after normalization', async () => {
    const tempDir = createTempDir();
    fs.writeFileSync(
      path.join(tempDir, 'accounts.csv'),
      'email,password\nUser@example.com,one\n user@example.com ,two\n',
      'utf8',
    );

    const result = loadFreshAdobeAccounts({ cwd: tempDir, env: {} });
    expect(result.accounts).toEqual([
      {
        email: 'user@example.com',
        password: 'one',
      },
    ]);
  });

  test('filters already consumed accounts before test declaration', async () => {
    const tempDir = createTempDir();
    fs.writeFileSync(
      path.join(tempDir, 'accounts.csv'),
      'email,password\nfirst@example.com,one\nsecond@example.com,two\n',
      'utf8',
    );
    fs.mkdirSync(path.join(tempDir, 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'reports', 'adobe_consumed_accounts.csv'),
      'email,consumed_at\nFIRST@example.com,2026-04-27T00:00:00.000Z\n',
      'utf8',
    );

    const result = loadFreshAdobeAccounts({ cwd: tempDir, env: {} });
    expect(result.accounts).toEqual([
      {
        email: 'second@example.com',
        password: 'two',
      },
    ]);
  });

  test('shards accounts by Cloud Run task index', async () => {
    const tempDir = createTempDir();
    fs.writeFileSync(
      path.join(tempDir, 'accounts.csv'),
      [
        'email,password',
        'first@example.com,one',
        'second@example.com,two',
        'third@example.com,three',
        'fourth@example.com,four',
        'fifth@example.com,five',
      ].join('\n'),
      'utf8',
    );

    const result = loadFreshAdobeAccounts({
      cwd: tempDir,
      env: {
        CLOUD_RUN_TASK_INDEX: '1',
        CLOUD_RUN_TASK_COUNT: '2',
      },
    });

    expect(result.shard).toEqual({
      index: 1,
      total: 2,
      source: 'cloud-run',
    });
    expect(result.accounts.map((account) => account.email)).toEqual([
      'second@example.com',
      'fourth@example.com',
    ]);
  });

  test('fails clearly when account shard configuration is invalid', async () => {
    const tempDir = createTempDir();
    fs.writeFileSync(path.join(tempDir, 'accounts.csv'), 'email,password\nfirst@example.com,one\n', 'utf8');

    expect(() => loadFreshAdobeAccounts({
      cwd: tempDir,
      env: {
        CLOUD_RUN_TASK_INDEX: '2',
        CLOUD_RUN_TASK_COUNT: '2',
      },
    })).toThrow(/CLOUD_RUN_TASK_INDEX must be less than CLOUD_RUN_TASK_COUNT/);
  });

  test('returns a skip reason when all valid accounts are already consumed', async () => {
    const tempDir = createTempDir();
    fs.writeFileSync(
      path.join(tempDir, 'accounts.csv'),
      'email,password\nonly@example.com,one\n',
      'utf8',
    );
    fs.mkdirSync(path.join(tempDir, 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'reports', 'adobe_consumed_accounts.csv'),
      'email,consumed_at\nonly@example.com,2026-04-27T00:00:00.000Z\n',
      'utf8',
    );

    const result = loadFreshAdobeAccounts({ cwd: tempDir, env: {} });
    expect(result.accounts).toEqual([]);
    expect(result.skipReason).toBe(ADOBE_NO_FRESH_ACCOUNTS_REASON);
  });
});

test.describe('Adobe report merging', () => {
  test('merges result and consumed fragments into stable CSV outputs', async () => {
    const tempDir = createTempDir();
    const runId = 'merge-run';

    appendResultFragment(
      {
        timestamp: '2026-04-27T10:00:00.000Z',
        email: 'first@example.com',
        test_status: 'failed',
        failed_at_step: 'login',
        failure_reason: 'Bad credentials',
        duration_ms: '100',
      },
      { cwd: tempDir, runId, workerIndex: 0 },
    );
    appendResultFragment(
      {
        timestamp: '2026-04-27T10:01:00.000Z',
        email: 'second@example.com',
        test_status: 'passed',
        failed_at_step: '',
        failure_reason: '',
        duration_ms: '200',
      },
      { cwd: tempDir, runId, workerIndex: 1 },
    );
    appendConsumedFragment(
      {
        email: 'first@example.com',
        consumed_at: '2026-04-27T09:59:00.000Z',
      },
      { cwd: tempDir, runId, workerIndex: 0 },
    );
    appendConsumedFragment(
      {
        email: 'FIRST@example.com',
        consumed_at: '2026-04-27T10:05:00.000Z',
      },
      { cwd: tempDir, runId, workerIndex: 1 },
    );

    fs.mkdirSync(path.join(tempDir, 'reports'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'reports', 'adobe_consumed_accounts.csv'),
      'email,consumed_at\nhistorical@example.com,2026-04-26T00:00:00.000Z\n',
      'utf8',
    );

    const { consumedLedgerPath, resultsPath } = mergeAdobeRunArtifacts({
      cwd: tempDir,
      finishedAt: new Date('2026-04-27T10:10:00.000Z'),
      runId,
    });

    expect(fs.existsSync(resultsPath)).toBeTruthy();
    expect(fs.readFileSync(resultsPath, 'utf8')).toContain('first@example.com,failed,login,Bad credentials,100');
    expect(fs.readFileSync(resultsPath, 'utf8')).toContain('second@example.com,passed,,,200');

    const consumedLedger = fs.readFileSync(consumedLedgerPath, 'utf8');
    expect(consumedLedger).toContain('historical@example.com,2026-04-26T00:00:00.000Z');
    expect(consumedLedger).toContain('first@example.com,2026-04-27T09:59:00.000Z');
    expect(consumedLedger.match(/first@example\.com/g)?.length).toBe(1);
    expect(fs.existsSync(path.join(tempDir, 'reports', '.tmp', runId))).toBeFalsy();
  });
});

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adobe-v2-'));
}
