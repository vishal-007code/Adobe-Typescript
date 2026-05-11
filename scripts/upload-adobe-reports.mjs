import fs from 'node:fs';
import path from 'node:path';

const reportsGcsUri = process.env.ADOBE_REPORTS_GCS_URI?.trim();
if (!reportsGcsUri) {
  process.exit(0);
}

const runId = process.env.ADOBE_RUN_ID?.trim() || 'unknown-run';
const taskIndex = process.env.CLOUD_RUN_TASK_INDEX?.trim() || '0';
const shardPrefix = `${reportsGcsUri.replace(/\/$/, '')}/run-${runId}/task-${taskIndex}`;
const files = [
  {
    localPath: process.env.ADOBE_RESULTS_PATH?.trim(),
    remoteName: 'results.csv',
    contentType: 'text/csv; charset=utf-8',
  },
  {
    localPath: process.env.ADOBE_CONSUMED_LEDGER_PATH?.trim(),
    remoteName: 'consumed_accounts.csv',
    contentType: 'text/csv; charset=utf-8',
  },
  {
    localPath: process.env.ADOBE_REPORT_SUMMARY_PATH?.trim(),
    remoteName: 'summary.json',
    contentType: 'application/json; charset=utf-8',
  },
].filter((file) => file.localPath && fs.existsSync(file.localPath));

if (files.length === 0) {
  console.log(`No report files found to upload for ${shardPrefix}.`);
  process.exit(0);
}

const match = /^gs:\/\/([^/]+)(?:\/(.*))?$/.exec(reportsGcsUri);
if (!match) {
  throw new Error(`ADOBE_REPORTS_GCS_URI must use the form gs://bucket/prefix, got: ${reportsGcsUri}`);
}

const bucket = match[1];
const basePrefix = (match[2] ?? '').replace(/\/$/, '');
const token = await getAccessToken();

for (const file of files) {
  const remotePath = [basePrefix, `run-${runId}`, `task-${taskIndex}`, file.remoteName]
    .filter(Boolean)
    .join('/');
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  uploadUrl.searchParams.set('uploadType', 'media');
  uploadUrl.searchParams.set('name', remotePath);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.contentType,
    },
    body: fs.readFileSync(file.localPath),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to upload ${file.localPath} to gs://${bucket}/${remotePath}: ${response.status} ${response.statusText} ${body}`);
  }

  console.log(`Uploaded ${file.localPath} to gs://${bucket}/${remotePath}`);
}

async function getAccessToken() {
  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    {
      headers: {
        'Metadata-Flavor': 'Google',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to read metadata server token: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Metadata server response did not include an access_token.');
  }

  return payload.access_token;
}
