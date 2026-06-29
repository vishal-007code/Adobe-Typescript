#!/usr/bin/env node
// Builds a "resume" CSV of accounts that did NOT pass, by diffing the original
// input CSV against the [ADOBE_RESULT] markers emitted to the Cloud Run logs.
//
// Usage:
//   node scripts/build-resume-csv.mjs <input-csv> <logs-file> <output-csv>
//
//   <input-csv>   Original accounts CSV (header + "email,password" rows).
//   <logs-file>   Text dump of Cloud Run logs (see scripts/build-resume-csv.sh).
//   <output-csv>  Where to write the remaining accounts to retry.
//
// "Done" = an account that produced `status=passed`. Everything else (failed,
// skipped, or never seen because a task died) is written to the resume CSV.

import fs from 'node:fs';

const [, , inputPath, logsPath, outputPath] = process.argv;

if (!inputPath || !logsPath || !outputPath) {
  console.error('Usage: node scripts/build-resume-csv.mjs <input-csv> <logs-file> <output-csv>');
  process.exit(1);
}

const normalize = (email) => email.trim().toLowerCase();
const emailOfRow = (row) => normalize((row.split(',')[0] ?? ''));

// ── Parse result markers from the logs ────────────────────────────────────────
const logText = fs.readFileSync(logsPath, 'utf8');
const markerRe = /\[ADOBE_RESULT\]\s+status=(\w+)\s+email=(\S+)/g;

const passed = new Set();
const statusCounts = { passed: 0, failed: 0, skipped: 0 };
let match;
while ((match = markerRe.exec(logText)) !== null) {
  const status = match[1];
  const email = normalize(match[2]);
  if (status in statusCounts) statusCounts[status] += 1;
  if (status === 'passed') passed.add(email);
}

// ── Diff against the input CSV ────────────────────────────────────────────────
const lines = fs.readFileSync(inputPath, 'utf8').split('\n').filter((l) => l.trim());
if (lines.length === 0) {
  console.error(`ERROR: input CSV is empty: ${inputPath}`);
  process.exit(1);
}

const header = lines[0];
const dataRows = lines.slice(1);
const remaining = dataRows.filter((row) => !passed.has(emailOfRow(row)));

fs.writeFileSync(outputPath, [header, ...remaining].join('\n') + '\n', 'utf8');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('──────────────────────────────────────────────');
console.log(`Input accounts:        ${dataRows.length}`);
console.log(`Passed (from logs):    ${passed.size}`);
console.log(`  result markers seen: passed=${statusCounts.passed} failed=${statusCounts.failed} skipped=${statusCounts.skipped}`);
console.log(`Remaining to retry:    ${remaining.length}  →  ${outputPath}`);
console.log('──────────────────────────────────────────────');
if (passed.size === 0) {
  console.log('WARNING: 0 passed markers parsed. Check the logs file / time window — every account will be retried.');
}
